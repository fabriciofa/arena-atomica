import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class QuietHandler(server.Handler):
    def log_request(self, code="-", size="-"):
        pass

    def log_error(self, message, *args):
        pass


class HttpTest(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.app = server.Server(("127.0.0.1", 0), QuietHandler)
        self.app.game = server.Game(Path(directory) / "http.sqlite3")
        thread = threading.Thread(target=self.app.serve_forever, kwargs={"poll_interval": 0.02})
        thread.start()

        def stop():
            self.app.shutdown()
            thread.join()
            self.app.server_close()

        self.addCleanup(stop)

    def request(self, method, path, body=None, **headers):
        host, port = self.app.server_address
        connection = http.client.HTTPConnection(host, port, timeout=2)
        try:
            connection.request(method, path, body, headers)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def post(self, path, data, **headers):
        return self.request("POST", path, json.dumps(data),
                            **{"Content-Type": "application/json", **headers})

    password = "test-passphrase-solo"

    def register(self, email, name="Marie", **headers):
        return self.post("/api/auth/register", {
            "name": name, "email": email, "password": self.password, "confirmation": self.password,
        }, **headers)

    def session(self, email, name="Marie"):
        status, headers, _ = self.register(email, name)
        self.assertEqual(status, 200)
        return headers["Set-Cookie"].split(";")[0]

    def test_identity_survives_login_and_revokes_only_the_current_session(self):
        for _ in range(2):
            status, headers, body = self.request("GET", "/api/state")
            self.assertEqual(status, 200)
            self.assertNotIn("Set-Cookie", headers)
            self.assertFalse(json.loads(body)["authenticated"])
        with self.app.game.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM players").fetchone()[0], 0)
        self.assertEqual(self.post("/api/ready", {"chemist": "curie"})[0], 401)
        one = self.session("MARIE@example.com")
        self.assertEqual(self.register("marie@example.com")[0], 400)
        self.assertEqual(self.post("/api/auth/login", {"email": "marie@example.com", "password": "errada"})[0], 401)
        _, headers, _ = self.post("/api/auth/login", {"email": "marie@example.com", "password": self.password})
        two = headers["Set-Cookie"].split(";")[0]
        self.assertNotEqual(one, two)
        state = lambda cookie: json.loads(self.request("GET", "/api/state", Cookie=cookie)[2])
        self.assertEqual(state(one)["account"], state(two)["account"])
        _, headers, _ = self.post("/api/auth/logout", {}, Cookie=one)
        self.assertIn("Max-Age=0", headers["Set-Cookie"])
        self.assertFalse(state(one)["authenticated"])
        self.assertTrue(state(two)["authenticated"])

    def test_password_confirmation_and_session_expiry(self):
        invalid = {"name": "Marie", "email": "marie@example.com", "password": self.password, "confirmation": "different"}
        self.assertEqual(self.post("/api/auth/register", invalid)[0], 400)
        with patch("server.time.time", return_value=100):
            cookie = self.session("marie@example.com")
        with patch("server.time.time", return_value=100 + server.SESSION_SECONDS):
            _, _, body = self.request("GET", "/api/state", Cookie=cookie)
            self.assertFalse(json.loads(body)["authenticated"])

    def test_legacy_can_be_claimed_once_without_rewriting_participants(self):
        legacy = "legacy-player"
        with self.app.game.connect() as db:
            db.execute("INSERT INTO players VALUES (?, 'Antiga', 'curie', 0, NULL)", (legacy,))
            db.execute("INSERT INTO players VALUES ('other', 'Outra', 'curie', 0, NULL)")
            match = {"players": [{"name": "Antiga", "chemist": "curie"}, {"name": "Outra", "chemist": "curie"}],
                     "winner": 0, "reason": "score", "log": [], "ended": 100}
            db.execute("INSERT INTO matches VALUES ('legacy-match', ?, 'other', ?, 100)", (legacy, json.dumps(match)))
        cookie = "reacao=" + legacy
        _, _, body = self.request("GET", "/api/state", Cookie=cookie)
        self.assertTrue(json.loads(body)["legacyAvailable"])
        self.assertEqual(self.request("GET", "/api/history/legacy-match", Cookie=cookie)[0], 404)
        data = {"name": "Marie", "email": "legacy@example.com", "password": self.password,
                "confirmation": self.password, "claimLegacy": True}
        status, headers, _ = self.post("/api/auth/register", data, Cookie=cookie)
        self.assertEqual(status, 200)
        session = headers["Set-Cookie"].split(";")[0]
        self.assertEqual(self.request("GET", "/api/history/legacy-match", Cookie=session)[0], 200)
        self.assertEqual(self.request("GET", "/api/history/legacy-match", Cookie=cookie)[0], 404)
        self.assertEqual(self.post("/api/auth/register", dict(data, email="other@example.com"), Cookie=cookie)[0], 400)

    def test_local_origin_and_session_flags(self):
        status, headers, _ = self.register("local@example.com")
        self.assertEqual(status, 200)
        issued = headers["Set-Cookie"]
        self.assertIn("HttpOnly", issued)
        self.assertIn("SameSite=Lax", issued)
        self.assertNotIn("Secure", issued)
        host, port = self.app.server_address
        status, _, body = self.post("/api/ready", {"name": "Marie", "chemist": "curie"},
                                    Origin=f"http://{host}:{port}", Cookie=issued.split(";")[0])
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["ready"])

    def test_public_origin_rejects_cross_site_writes_and_issues_secure_cookie(self):
        self.app.origin = server.public_origin("https://Arena.Example:443/")
        _, headers, _ = self.register("secure@example.com")
        issued = headers["Set-Cookie"]
        self.assertIn("; Secure", issued)
        cookie = issued.split(";")[0]
        data = {"name": "Marie", "chemist": "curie"}
        self.assertEqual(self.post("/api/ready", data, Origin="http://arena.example", Cookie=cookie)[0], 403)
        self.assertEqual(self.post("/api/ready", data, Origin="https://other.example", Cookie=cookie)[0], 403)
        self.assertEqual(self.post("/api/ready", data, Cookie=cookie, **{"Sec-Fetch-Site": "cross-site"})[0], 403)
        status, _, body = self.request("GET", "/api/state", Cookie=cookie)
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["ready"])
        self.assertEqual(self.post("/api/ready", data, Origin="https://arena.example", Cookie=cookie)[0], 200)

    def test_malformed_json_and_content_type_are_rejected(self):
        for body in ('{"name":', '[]', '[' * 1500 + ']' * 1500, " " * 4097):
            with self.subTest(length=len(body)):
                self.assertEqual(self.request("POST", "/api/ready", body,
                                             **{"Content-Type": "application/json"})[0], 400)
        self.assertEqual(self.request("POST", "/api/ready", "{}", **{"Content-Type": "text/plain"})[0], 400)

    def test_private_routes_and_duel_bank(self):
        self.assertEqual(self.request("GET", "/api/profile")[0], 404)
        self.assertEqual(self.request("GET", "/api/history/missing")[0], 404)
        self.assertEqual(self.request("GET", "/questions.json")[0], 404)
        self.assertEqual(self.request("GET", "/study.js")[0], 200)
        first = self.session("first@example.com", "Marie")
        second = self.session("second@example.com", "Dmitri")
        guest = self.session("guest@example.com", "Visitante")
        profile = self.request("GET", "/api/profile", Cookie=guest)
        self.assertEqual(profile[0], 200)
        self.assertNotIn("token", json.loads(profile[2]))
        for cookie, name, chemist in ((first, "Marie", "curie"), (second, "Dmitri", "mendeleev")):
            status, _, body = self.post("/api/ready", {"name": name, "chemist": chemist}, Cookie=cookie)
            self.assertEqual(status, 200)
        match = json.loads(body)["match"]
        route = "/api/history/" + match["id"]
        self.assertEqual(self.request("GET", route, Cookie=first)[0], 404)
        with patch("server.time.time", return_value=match["deadline"]):
            self.assertEqual(self.post("/api/leave", {"id": match["id"]}, Cookie=second)[0], 200)
        self.assertEqual(self.request("GET", route, Cookie=guest)[0], 404)
        self.assertEqual(self.request("GET", route, Cookie=first)[0], 200)
