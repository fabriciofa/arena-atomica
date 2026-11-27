import argparse
from collections import Counter
from contextlib import closing
import json
import os
import secrets
import sqlite3
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
QUESTIONS = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
CHEMISTS = ("curie", "mendeleev", "lavoisier", "franklin")
ARENAS = ("cristais", "eletrolise", "estufa")
COUNTDOWN_SECONDS = 3
ROUND_SECONDS = 35
RESPONSE_SECONDS = 15
REVEAL_SECONDS = 7
BOTH_ANSWERED_REVEAL_SECONDS = 3
MAX_ROUNDS = 10
PRESENCE_SECONDS = 40
CONNECTION_GRACE = 5
SPECIAL_THRESHOLD = 3
HIT_DAMAGE = 25
SPECIAL_DAMAGE = 40
RNG = secrets.SystemRandom()
STATIC = {"/": ("index.html", "text/html"), "/style.css": ("style.css", "text/css"),
          "/game.js": ("game.js", "text/javascript"), "/arena.js": ("arena.js", "text/javascript"),
          "/training.js": ("training.js", "text/javascript"), "/practice.js": ("practice.js", "text/javascript")}


def question_for(level, used):
    ids = [f"{level}:{i}" for i in range(len(QUESTIONS[level - 1]))]
    return RNG.choice([qid for qid in ids if qid not in used])


def question(qid, order=None):
    level, index = map(int, qid.split(":"))
    prompt, options, correct, *details = QUESTIONS[level - 1][index]
    if order is not None:
        options = [options[position] for position in order]
        correct = order.index(correct)
    return prompt, options, correct, *details


class Game:
    def __init__(self, path):
        self.path = path
        with closing(self.connect()) as db:
            db.executescript("""
                PRAGMA journal_mode = WAL;
                CREATE TABLE IF NOT EXISTS players (
                    token TEXT PRIMARY KEY, name TEXT NOT NULL, chemist TEXT NOT NULL,
                    seen REAL NOT NULL, ready REAL
                );
                CREATE TABLE IF NOT EXISTS matches (
                    id TEXT PRIMARY KEY, first TEXT NOT NULL REFERENCES players(token),
                    second TEXT NOT NULL REFERENCES players(token), data TEXT NOT NULL,
                    ended REAL, CHECK(first <> second)
                );
                CREATE INDEX IF NOT EXISTS first_matches ON matches(first, ended);
                CREATE INDEX IF NOT EXISTS second_matches ON matches(second, ended);
            """)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def save(self, db, match):
        db.execute("UPDATE matches SET data=?, ended=? WHERE id=?",
                   (json.dumps(match), match.get("ended"), match["id"]))

    def advance(self, match, presence, now):
        stale = [now - last > PRESENCE_SECONDS for last in presence]
        if match["phase"] == "countdown":
            if now >= match["deadline"]:
                start = match["deadline"]
                match.update(phase="question", started=start, deadline=start + ROUND_SECONDS,
                             used=[question_for(1, [])], optionOrder=RNG.sample(range(4), 4))
            return
        if any(stale) and match["phase"] == "question":
            winner = None if all(stale) else stale.index(False)
            self.finish(match, winner, "disconnect", now)
        if match["phase"] == "question" and now >= match["deadline"]:
            self.resolve(match, now)
        if match["phase"] != "reveal" or now < match["deadline"]:
            return
        if self.result_locked(match):
            first, second = match["hp"]
            winner = None if first == second else int(second > first)
            self.finish(match, winner, "score", now)
        elif any(stale):
            winner = None if all(stale) else stale.index(False)
            self.finish(match, winner, "disconnect", now)
        else:
            match["round"] += 1
            match["level"] = min(len(QUESTIONS), match["level"] + int(any(match["result"]["correct"])))
            match["used"].append(question_for(match["level"], match["used"]))
            match.update(phase="question", deadline=now + ROUND_SECONDS, answers=[None, None],
                         result=None, optionOrder=RNG.sample(range(4), 4))

    @staticmethod
    def result_locked(match):
        return match["phase"] == "reveal" and (min(match["hp"]) <= 0 or match["round"] == MAX_ROUNDS)

    @staticmethod
    def finish(match, winner, reason, now):
        match.update(phase="finished", winner=winner, reason=reason, ended=now, deadline=None)

    @staticmethod
    def charge(match):
        return [total % SPECIAL_THRESHOLD for total in Game.scores(match)]

    @staticmethod
    def resolve(match, now):
        qid = match["used"][-1]
        order = match.get("optionOrder")
        _, _, correct, *_ = question(qid, order)
        hits = [answer == correct for answer in match["answers"]]
        specials = [hit and charge == SPECIAL_THRESHOLD - 1
                    for hit, charge in zip(hits, Game.charge(match))]
        damaged = None if hits[0] == hits[1] else hits.index(False)
        damage = 0
        finisher = None
        if damaged is not None:
            strength = SPECIAL_DAMAGE if specials[1 - damaged] else HIT_DAMAGE
            damage = min(strength, match["hp"][damaged])
            match["hp"][damaged] -= damage
            if match["hp"][damaged] == 0:
                attacker = 1 - damaged
                finisher = match["players"][attacker]["chemist"]
                specials[attacker] = False
        match["result"] = {"correct": hits, "damaged": damaged, "choices": match["answers"],
                           "specials": specials, "damage": damage, "finisher": finisher}
        match["log"].append({"question": qid, "optionOrder": order, **match["result"]})
        reveal_seconds = (BOTH_ANSWERED_REVEAL_SECONDS if None not in match["answers"] else REVEAL_SECONDS)
        match.update(phase="reveal", deadline=now + reveal_seconds)

    def pair(self, db, now):
        rows = db.execute("SELECT token,name,chemist FROM players WHERE ready IS NOT NULL AND seen>=?",
                          (now - PRESENCE_SECONDS,)).fetchall()
        RNG.shuffle(rows)
        for first, second in zip(rows[::2], rows[1::2]):
            tokens = (first["token"], second["token"])
            match = dict(id=secrets.token_hex(12), players=[
                dict(name=p["name"], chemist=p["chemist"]) for p in (first, second)
            ], arena=RNG.choice(ARENAS), hp=[100, 100], round=1, level=1, phase="countdown",
                deadline=now + COUNTDOWN_SECONDS, used=[], answers=[None, None],
                result=None, log=[])
            db.execute("INSERT INTO matches VALUES (?,?,?,?,NULL)",
                       (match["id"], *tokens, json.dumps(match)))
            db.execute("UPDATE players SET ready=NULL WHERE token IN (?,?)", tokens)

    def active_row(self, db, token):
        return db.execute("SELECT * FROM matches WHERE ended IS NULL AND (first=? OR second=?)",
                          (token, token)).fetchone()

    @staticmethod
    def cancel_countdown(db, match_id, tokens, now):
        db.execute("DELETE FROM matches WHERE id=?", (match_id,))
        for token in tokens:
            db.execute("UPDATE players SET ready=? WHERE token=? AND seen>=?",
                       (now, token, now - PRESENCE_SECONDS))

    def tick(self, db, now):
        db.execute("UPDATE players SET ready=NULL WHERE ready IS NOT NULL AND seen<?", (now - PRESENCE_SECONDS,))
        rows = db.execute("""
            SELECT m.data, m.first, m.second, a.seen AS seen_a, b.seen AS seen_b FROM matches m
            JOIN players a ON a.token=m.first JOIN players b ON b.token=m.second WHERE m.ended IS NULL
        """).fetchall()
        for row in rows:
            match = json.loads(row["data"])
            before = (match["phase"], match["round"])
            presence = (row["seen_a"], row["seen_b"])
            if match["phase"] == "countdown" and any(now - seen > PRESENCE_SECONDS for seen in presence):
                self.cancel_countdown(db, match["id"], (row["first"], row["second"]), now)
                continue
            self.advance(match, presence, now)
            if before != (match["phase"], match["round"]):
                self.save(db, match)

    @staticmethod
    def scores(match):
        return [sum(entry["correct"][side] for entry in match["log"]) for side in range(2)]

    @staticmethod
    def summary(match, side):
        review = []
        hits = errors = unanswered = streak = best = 0
        for entry in match["log"]:
            prompt, options, correct, _, topic, explanation = question(entry["question"], entry.get("optionOrder"))
            choice = entry["choices"][side]
            if entry["correct"][side]:
                hits += 1
                streak += 1
                best = max(best, streak)
            else:
                streak = 0
                unanswered += int(choice is None)
                errors += int(choice is not None)
            review.append({
                "prompt": prompt, "topic": topic, "explanation": explanation,
                "correct": {"letter": "ABCD"[correct], "text": options[correct]},
                "answer": None if choice is None else {"letter": "ABCD"[choice], "text": options[choice]},
            })
        return {"points": hits, "hits": hits, "errors": errors, "unanswered": unanswered,
                "accuracy": round(100 * hits / (hits + errors)) if hits + errors else None,
                "bestStreak": best, "review": review}

    def snapshot(self, db, token, now):
        profile = db.execute("SELECT name, chemist, ready FROM players WHERE token=?", (token,)).fetchone()
        row = self.active_row(db, token)
        if not row and profile["ready"] is None:
            row = db.execute("""SELECT * FROM matches WHERE ended>? AND (first=? OR second=?)
                                ORDER BY ended DESC LIMIT 1""", (now - 900, token, token)).fetchone()
        history = []
        missed_topics = Counter()
        for item in db.execute("""SELECT * FROM matches WHERE ended IS NOT NULL AND (first=? OR second=?)
                                  ORDER BY ended DESC LIMIT 10""", (token, token)):
            old = json.loads(item["data"])
            side = int(item["second"] == token)
            missed_topics.update(question(entry["question"])[4] for entry in old["log"]
                                 if entry["choices"][side] is not None and not entry["correct"][side])
            history.append({"id": old["id"], "opponent": old["players"][1-side]["name"],
                            "outcome": "Empate" if old["winner"] is None else ("Vitória" if old["winner"] == side else "Derrota"),
                            "rounds": len(old["log"])})
        state = {"profile": {"name": profile["name"], "chemist": profile["chemist"]},
                 "ready": profile["ready"] is not None, "now": now, "history": history, "match": None,
                 "reviewTopics": [{"topic": topic, "misses": count} for topic, count in missed_topics.most_common(3)],
                 "rules": {"rounds": MAX_ROUNDS, "roundSeconds": ROUND_SECONDS, "responseSeconds": RESPONSE_SECONDS,
                           "specialThreshold": SPECIAL_THRESHOLD, "hitDamage": HIT_DAMAGE, "specialDamage": SPECIAL_DAMAGE},
                 "online": db.execute("SELECT COUNT(*) FROM players WHERE seen>=?", (now - PRESENCE_SECONDS,)).fetchone()[0]}
        if row:
            match = json.loads(row["data"])
            side = int(row["second"] == token)
            public = {key: match[key] for key in ("id", "players", "arena", "hp", "round", "level", "phase", "deadline", "result")}
            public["scores"] = self.scores(match)
            public["resultLocked"] = self.result_locked(match)
            if match["phase"] != "finished":
                seen = {item["token"]: item["seen"] for item in
                        db.execute("SELECT token,seen FROM players WHERE token IN (?,?)", (row["first"], row["second"]))}
                public["connections"] = [now - seen[token] <= CONNECTION_GRACE for token in (row["first"], row["second"])]
            public["charge"] = self.charge(match)
            public["specialThreshold"] = SPECIAL_THRESHOLD
            public["side"] = side
            public["answered"] = [choice is not None for choice in match["answers"]]
            public["choice"] = match["answers"][side]
            if match["phase"] == "finished":
                public.update(self.result_details(match, side))
            elif match["phase"] != "countdown":
                prompt, options, correct, number, *_ = question(match["used"][-1], match.get("optionOrder"))
                public.update(prompt=prompt, options=options, number=number)
                if match["phase"] == "reveal":
                    public.update(correct=correct)
            state["match"] = public
        return state

    def result_details(self, match, side):
        started = match.get("started")
        return {"players": match["players"], "scores": self.scores(match), "side": side,
                "winner": match["winner"], "reason": match["reason"], "summary": self.summary(match, side),
                "duration": max(0, round(match["ended"] - started)) if started is not None else None}

    def player_profile(self, token):
        with closing(self.connect()) as db:
            profile = db.execute("SELECT name, chemist FROM players WHERE token=?", (token,)).fetchone()
            if profile is None:
                return None
            wins = losses = draws = hits = errors = unanswered = 0
            for row in db.execute("""SELECT second, data FROM matches WHERE ended IS NOT NULL
                                      AND (first=? OR second=?)""", (token, token)):
                match = json.loads(row["data"])
                side = int(row["second"] == token)
                winner = match["winner"]
                wins += int(winner == side)
                losses += int(winner is not None and winner != side)
                draws += int(winner is None)
                for entry in match["log"]:
                    if entry["correct"][side]:
                        hits += 1
                    elif entry["choices"][side] is None:
                        unanswered += 1
                    else:
                        errors += 1
        return {"name": profile["name"], "chemist": profile["chemist"], "wins": wins,
                "losses": losses, "draws": draws, "points": hits, "errors": errors,
                "unanswered": unanswered, "accuracy": round(100 * hits / (hits + errors)) if hits + errors else None}

    def history_result(self, token, match_id):
        with closing(self.connect()) as db:
            row = db.execute("""SELECT * FROM matches WHERE id=? AND ended IS NOT NULL
                                AND (first=? OR second=?)""", (match_id, token, token)).fetchone()
        if row is None:
            return None
        return self.result_details(json.loads(row["data"]), int(row["second"] == token))

    def request(self, token, action, payload):
        db = self.connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            now = time.time()
            player = db.execute("SELECT token FROM players WHERE token=?", (token,)).fetchone()
            if player:
                db.execute("UPDATE players SET seen=? WHERE token=?", (now, token))
            else:
                token = secrets.token_urlsafe(32)
                db.execute("INSERT INTO players VALUES (?, ?, ?, ?, NULL)",
                           (token, f"Jogador {token[:4].upper()}", "curie", now))
            self.tick(db, now)
            row = self.active_row(db, token)
            error = None
            if action == "/api/ready":
                if row:
                    error = "Você já está em um duelo."
                else:
                    name, chemist = payload.get("name"), payload.get("chemist")
                    if (not isinstance(name, str) or not 2 <= len(name.strip()) <= 24
                            or not name.isprintable() or chemist not in CHEMISTS):
                        error = "Escolha um químico e digite um nome de 2 a 24 caracteres."
                    else:
                        db.execute("UPDATE players SET name=?, chemist=?, ready=? WHERE token=?",
                                   (name.strip(), chemist, now, token))
            elif action == "/api/cancel":
                if row and json.loads(row["data"])["phase"] == "countdown":
                    opponent = row["first"] if row["second"] == token else row["second"]
                    self.cancel_countdown(db, row["id"], (opponent,), now)
                elif row:
                    error = "O duelo já começou."
                db.execute("UPDATE players SET ready=NULL WHERE token=?", (token,))
            elif action in ("/api/answer", "/api/leave"):
                if not row or payload.get("id") != row["id"]:
                    error = "Este duelo já terminou."
                else:
                    match = json.loads(row["data"])
                    side = int(row["second"] == token)
                    if action == "/api/leave":
                        if match["phase"] == "countdown":
                            error = "Cancele a prontidão antes de iniciar o duelo."
                        elif self.result_locked(match):
                            error = "O resultado do duelo já foi definido."
                        else:
                            self.finish(match, 1 - side, "forfeit", now)
                            self.save(db, match)
                    else:
                        choice = payload.get("choice")
                        if type(choice) is not int or not 0 <= choice < 4:
                            error = "Escolha uma das quatro alternativas."
                        elif (match["phase"] != "question" or type(payload.get("round")) is not int
                              or payload["round"] != match["round"]
                              or match["answers"][side] is not None):
                            error = "A resposta desta rodada já foi encerrada."
                        else:
                            match["answers"][side] = choice
                            if None in match["answers"]:
                                match["deadline"] = now + RESPONSE_SECONDS
                            else:
                                self.resolve(match, now)
                            self.save(db, match)
            self.pair(db, now)
            state = self.snapshot(db, token, now)
            db.commit()
            return token, state, error
        finally:
            db.close()


class Server(ThreadingHTTPServer):
    next_tick = 0

    def service_actions(self):
        if time.monotonic() < self.next_tick:
            return
        self.next_tick = time.monotonic() + 2
        with closing(self.game.connect()) as db:
            db.execute("BEGIN IMMEDIATE")
            self.game.tick(db, time.time())
            db.commit()


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, data, content_type, cookie=None):
        self.send_response(code)
        self.send_header("Content-Type", content_type + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        if cookie:
            self.send_header("Set-Cookie", f"reacao={cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        route = self.path.split("?")[0]
        if route == "/api/state":
            self.api(route, {})
        elif route == "/api/profile":
            profile = self.server.game.player_profile(self.session_token())
            if profile is None:
                self.send_error(404)
            else:
                self.respond(200, json.dumps(profile).encode("utf-8"), "application/json")
        elif route.startswith("/api/history/"):
            token = self.session_token()
            result = self.server.game.history_result(token, route.removeprefix("/api/history/"))
            if result is None:
                self.send_error(404)
            else:
                self.respond(200, json.dumps(result).encode("utf-8"), "application/json")
        elif route in STATIC:
            filename, kind = STATIC[route]
            self.respond(200, (ROOT / filename).read_bytes(), kind)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path not in ("/api/ready", "/api/cancel", "/api/answer", "/api/leave"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if self.headers.get_content_type() != "application/json" or not 0 < length <= 4096:
                raise ValueError
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError
        except (ValueError, UnicodeError):
            self.send_error(400)
            return
        self.api(self.path, payload)

    def session_token(self):
        cookies = SimpleCookie()
        cookies.load(self.headers.get("Cookie", ""))
        cookie = cookies.get("reacao")
        return cookie.value if cookie else ""

    def api(self, route, payload):
        current = self.session_token()
        token, state, error = self.server.game.request(current, route, payload)
        if error:
            state["error"] = error
        self.respond(409 if error else 200, json.dumps(state).encode("utf-8"), "application/json",
                     token if token != current else None)

    def log_request(self, code="-", size="-"):
        if self.path != "/api/state" or code != 200:
            super().log_request(code, size)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--db", default=os.environ.get("REACAO_DB", str(ROOT / "reacao.sqlite3")))
    args = parser.parse_args()
    server = Server((args.host, args.port), Handler)
    server.game = Game(args.db)
    print(f"Reação! na porta {server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
