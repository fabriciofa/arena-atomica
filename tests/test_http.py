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

    def session(self):
        status, headers, _ = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        return headers["Set-Cookie"].split(";")[0]

    def test_local_origin_and_session_flags(self):
        status, headers, body = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertIn("profile", json.loads(body))
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
        _, headers, _ = self.request("GET", "/api/state")
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
        first, second, guest = [self.session() for _ in range(3)]
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
