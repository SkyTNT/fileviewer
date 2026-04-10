import os
import secrets

_session_token: str | None = None


def auth_required() -> bool:
    return bool(os.environ.get("FILE_VIEWER_USER"))


def check_credentials(username: str, password: str) -> bool:
    user = os.environ.get("FILE_VIEWER_USER", "")
    pwd  = os.environ.get("FILE_VIEWER_PASS", "")
    return secrets.compare_digest(username, user) and secrets.compare_digest(password, pwd)


def create_token() -> str:
    global _session_token
    _session_token = secrets.token_hex(32)
    return _session_token


def revoke_token() -> None:
    global _session_token
    _session_token = None


def verify_token(token: str | None) -> bool:
    if not auth_required():
        return True
    if not token or not _session_token:
        return False
    return secrets.compare_digest(token, _session_token)
