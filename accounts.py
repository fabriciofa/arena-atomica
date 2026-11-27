"""Permanent accounts and revocable browser sessions."""
import hashlib
import hmac
import re
import secrets
from contextlib import closing

SESSION_SECONDS = 30 * 24 * 60 * 60
EMAIL = re.compile(r"[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+")
SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    player TEXT NOT NULL UNIQUE REFERENCES players(token),
    email TEXT NOT NULL UNIQUE,
    salt BLOB NOT NULL,
    password_hash BLOB NOT NULL,
    created REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    digest TEXT PRIMARY KEY,
    account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
"""


def digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**15, r=8, p=1, maxmem=64 * 1024**2)


def normalized_email(value):
    if isinstance(value, str):
        email = value.strip().casefold()
        if utf8_length(email, 254) and EMAIL.fullmatch(email):
            return email
    return None


def utf8_length(value, maximum):
    try:
        return isinstance(value, str) and 1 <= len(value.encode("utf-8")) <= maximum
    except UnicodeError:
        return False


def credentials(data):
    email = normalized_email(data.get("email"))
    password = data.get("password")
    if email and utf8_length(password, 256):
        return email, password
    return None


class Accounts:
    def __init__(self, connect):
        self.connect = connect
        with closing(connect()) as db:
            db.executescript(SCHEMA)

    @staticmethod
    def legacy_player(db, token):
        return db.execute("""SELECT token FROM players
                             WHERE token=? AND NOT EXISTS (SELECT 1 FROM accounts WHERE player=players.token)""",
                          (token,)).fetchone()

    def can_claim(self, token):
        if not token:
            return False
        with closing(self.connect()) as db:
            return self.legacy_player(db, token) is not None

    def register(self, data, legacy, now):
        errors = {}
        name = data.get("name")
        email = normalized_email(data.get("email"))
        password = data.get("password")
        if not isinstance(name, str) or not name.isprintable() or not 2 <= len(name.strip()) <= 24:
            errors["name"] = "Informe um nome de exibição de 2 a 24 caracteres."
        if email is None:
            errors["email"] = "Informe um e-mail válido."
        if not utf8_length(password, 256) or len(password) < 12:
            errors["password"] = "Use uma senha com pelo menos 12 caracteres e até 256 bytes."
        confirmation = data.get("confirmation")
        if not confirmation:
            errors["confirmation"] = "Confirme sua senha."
        elif password != confirmation:
            errors["confirmation"] = "As senhas não coincidem."
        if errors:
            return None, {"error": "Revise os campos indicados.", "fieldErrors": errors}
        salt = secrets.token_bytes(16)
        password_key = password_hash(password, salt)
        with closing(self.connect()) as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM accounts WHERE email=?", (email,)).fetchone():
                return None, {"error": "Revise os campos indicados.",
                              "fieldErrors": {"email": "Já existe uma conta com esse e-mail."}}
            player = secrets.token_urlsafe(32)
            if data.get("claimLegacy") is True:
                if not legacy or self.legacy_player(db, legacy) is None:
                    return None, {"error": "O histórico deste navegador já foi transferido ou está indisponível."}
                active = db.execute("""SELECT 1 FROM matches
                                       WHERE ended IS NULL AND (first=? OR second=?)""", (legacy, legacy)).fetchone()
                if active:
                    return None, {"error": "Aguarde o encerramento do duelo antigo para transferir o histórico."}
                player = legacy
                db.execute("UPDATE players SET name=?, ready=NULL, seen=? WHERE token=?", (name.strip(), now, player))
            else:
                db.execute("INSERT INTO players VALUES (?, ?, 'curie', ?, NULL)", (player, name.strip(), now))
            account = secrets.token_hex(16)
            db.execute("INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)",
                       (account, player, email, salt, password_key, now))
            session = self.issue(db, account, now)
            db.commit()
            return session, None

    @staticmethod
    def issue(db, account, now):
        token = secrets.token_urlsafe(32)
        db.execute("DELETE FROM sessions WHERE expires<=?", (now,))
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (digest(token), account, now + SESSION_SECONDS))
        return token

    def login(self, data, now):
        submitted = credentials(data)
        if submitted is None:
            return None
        email, password = submitted
        with closing(self.connect()) as db:
            account = db.execute("SELECT * FROM accounts WHERE email=?", (email,)).fetchone()
            expected = account["password_hash"] if account else bytes(64)
            candidate = password_hash(password, account["salt"] if account else bytes(16))
            if not hmac.compare_digest(candidate, expected) or account is None:
                return None
            db.execute("BEGIN IMMEDIATE")
            token = self.issue(db, account["id"], now)
            db.commit()
            return token

    def resolve(self, token, now):
        if not token.isascii() or len(token) != 43:
            return None
        with closing(self.connect()) as db:
            return db.execute("""SELECT accounts.id, player, email, created FROM sessions
                                 JOIN accounts ON accounts.id=sessions.account
                                 WHERE digest=? AND expires>?""", (digest(token), now)).fetchone()

    def logout(self, token, now):
        if not token.isascii() or len(token) != 43:
            return
        with closing(self.connect()) as db:
            db.execute("BEGIN IMMEDIATE")
            session = db.execute("""SELECT account, player FROM sessions
                                    JOIN accounts ON accounts.id=sessions.account
                                    WHERE digest=?""", (digest(token),)).fetchone()
            db.execute("DELETE FROM sessions WHERE digest=?", (digest(token),))
            if session and not db.execute("SELECT 1 FROM sessions WHERE account=? AND expires>?",
                                          (session["account"], now)).fetchone():
                db.execute("UPDATE players SET ready=NULL, seen=0 WHERE token=?", (session["player"],))
            db.commit()
