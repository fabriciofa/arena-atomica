import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import server


class DuelTest(unittest.TestCase):
    def setUp(self):
        folder = self.enterContext(tempfile.TemporaryDirectory())
        self.path = Path(folder) / "duel.sqlite3"
        self.game = server.Game(self.path)
        self.now = 1000
        self.created_players = 0
        self.enterContext(patch("server.time.time", side_effect=lambda: self.now))
        self.first, queued, _ = self.request("", "ready", name="Marie", chemist="curie")
        self.assertTrue(queued["ready"])
        self.second, paired, _ = self.request("", "ready", name="Dmitri", chemist="mendeleev")
        self.assertEqual(paired["match"]["phase"], "countdown")

    def request(self, player, action="state", **data):
        if not player:
            self.created_players += 1
            password = "test-passphrase-solo"
            session, error = self.game.accounts.register({
                "name": data.get("name", "Visitante"), "email": f"test{self.created_players}@example.com",
                "password": password, "confirmation": password,
            }, "", self.now)
            self.assertIsNone(error)
            player = self.game.accounts.resolve(session, self.now)["player"]
        return self.game.request(player, "/api/" + action, data)

    def match(self, player=None):
        return self.request(player or self.first)[1]["match"]

    def answer(self, player, match, choice):
        return self.request(player, "answer", id=match["id"], round=match["round"], choice=choice)

    def start(self):
        self.now += server.COUNTDOWN_SECONDS
        match = self.match()
        self.assertEqual(match["phase"], "question")
        self.assertNotIn("correct", match)
        return match

    def correct(self, match):
        correct_text = next(q[1][q[2]] for tier in server.QUESTIONS for q in tier if q[3] == match["number"])
        return match["options"].index(correct_text)

    def test_countdown_cancel_requeues_opponent(self):
        match = self.match()
        self.assertNotIn("prompt", match)
        self.assertTrue(self.answer(self.first, match, 0)[2])
        self.assertIsNone(self.request(self.first, "cancel")[1]["match"])
        self.assertTrue(self.request(self.second)[1]["ready"])

    def test_last_round_result_survives_leave_and_restart(self):
        match = self.start()
        for round_number in range(1, server.MAX_ROUNDS + 1):
            self.assertEqual(match["round"], round_number)
            correct = self.correct(match)
            self.assertIsNone(self.answer(self.first, match, correct)[2])
            other_choice = (correct + 1) % 4 if round_number == 1 else correct
            _, state, error = self.answer(self.second, match, other_choice)
            self.assertIsNone(error)
            reveal = state["match"]
            self.assertEqual(reveal["phase"], "reveal")
            if round_number < server.MAX_ROUNDS:
                self.now = reveal["deadline"]
                match = self.match()

        self.assertTrue(self.request(self.first, "leave", id=match["id"])[2])
        self.now = reveal["deadline"]
        self.game = server.Game(self.path)
        final = self.match()
        self.assertEqual(final["phase"], "finished")
        self.assertEqual(final["reason"], "score")
        self.assertEqual(final["winner"], final["side"])
        self.assertEqual(final["summary"]["points"], server.MAX_ROUNDS)
        self.assertTrue(all(item["answer"] == item["correct"] for item in final["summary"]["review"]))

    def test_simultaneous_answers_resolve_once(self):
        match = self.start()
        self.assertEqual(self.match(self.second)["options"], match["options"])
        correct = self.correct(match)
        with ThreadPoolExecutor(max_workers=2) as pool:
            requests = [pool.submit(self.answer, player, match, correct) for player in (self.first, self.second)]
            for request in requests:
                self.assertIsNone(request.result()[2])
        reveal = self.match()
        self.assertEqual(reveal["scores"], [1, 1])
        self.assertEqual(reveal["hp"], [100, 100])
        self.assertEqual(reveal["deadline"] - self.now, 3)
        self.assertTrue(self.answer(self.first, match, correct)[2])

    def test_timeout_and_answer_privacy(self):
        match = self.start()
        correct = self.correct(match)
        self.answer(self.first, match, correct)
        other = self.match(self.second)
        self.assertNotIn("correct", other)
        self.assertIsNone(other["choice"])
        self.assertEqual(other["deadline"] - self.now, 15)
        self.assertTrue(self.answer(self.first, match, correct)[2])
        self.now = other["deadline"]
        self.assertTrue(self.answer(self.second, match, correct)[2])
        reveal = self.match(self.second)
        self.assertEqual(reveal["hp"][reveal["side"]], 75)
        self.assertEqual(reveal["deadline"] - self.now, 7)

    def test_history_is_available_only_to_participants_after_finish(self):
        match = self.start()
        guest, _, _ = self.request("")
        self.assertIsNone(self.game.history_result(self.first, match["id"]))
        correct = self.correct(match)
        self.answer(self.first, match, correct)
        self.answer(self.second, match, (correct + 1) % 4)
        _, state, _ = self.request(self.second, "leave", id=match["id"])
        topic = next(q[4] for tier in server.QUESTIONS for q in tier if q[3] == match["number"])
        self.assertEqual(state["reviewTopics"], [{"topic": topic, "misses": 1}])
        self.assertEqual(self.request(self.first)[1]["reviewTopics"], [])
        self.assertIsNone(self.game.history_result(guest, match["id"]))
        result = self.game.history_result(self.first, match["id"])
        self.assertEqual(result["summary"]["points"], 1)
        self.assertEqual(result["summary"]["review"][0]["correct"]["letter"], "ABCD"[correct])

    def test_profile_counts_only_completed_duels_for_the_current_player(self):
        match = self.start()
        correct = self.correct(match)
        self.answer(self.first, match, correct)
        self.answer(self.second, match, (correct + 1) % 4)
        self.assertEqual(self.game.player_profile(self.first)["points"], 0)
        self.assertIsNone(self.game.player_profile(""))
        self.request(self.second, "leave", id=match["id"])
        first = self.game.player_profile(self.first)
        second = self.game.player_profile(self.second)
        self.assertEqual((first["name"], first["chemist"]), ("Marie", "curie"))
        self.assertEqual((first["wins"], first["losses"], first["draws"], first["points"], first["accuracy"]),
                         (1, 0, 0, 1, 100))
        self.assertEqual((second["wins"], second["losses"], second["points"], second["errors"], second["accuracy"]),
                         (0, 1, 0, 1, 0))
        self.game = server.Game(self.path)
        self.assertEqual(self.game.player_profile(self.first), first)

    def test_historical_review_uses_original_order_without_saved_permutation(self):
        correct = server.question("1:0")[2]
        match = {"log": [{"question": "1:0", "correct": [True, False], "choices": [correct, None]}]}
        row = self.game.summary(match, 0)["review"][0]
        self.assertEqual(row["correct"]["letter"], "ABCD"[correct])
        self.assertEqual(row["answer"], row["correct"])

    def test_connection_warning_recovery_and_disconnect(self):
        match = self.start()
        self.now += server.CONNECTION_GRACE + 1
        self.assertFalse(self.match()["connections"][1 - match["side"]])
        self.assertTrue(all(self.match(self.second)["connections"]))
        self.now += server.PRESENCE_SECONDS + 1
        final = self.match()
        self.assertEqual(final["reason"], "disconnect")
        self.assertEqual(final["winner"], final["side"])


if __name__ == "__main__":
    unittest.main()
