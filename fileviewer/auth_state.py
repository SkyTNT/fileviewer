import os
import secrets

_session_tokens: set[str] = set()


def auth_required() -> bool:
    return bool(os.environ.get("FILE_VIEWER_USER"))


def check_credentials(username: str, password: str) -> bool:
    user = os.environ.get("FILE_VIEWER_USER", "")
    pwd  = os.environ.get("FILE_VIEWER_PASS", "")
    return secrets.compare_digest(username, user) and secrets.compare_digest(password, pwd)


def create_token() -> str:
    token = secrets.token_hex(32)
    _session_tokens.add(token)
    return token


def revoke_token(token: str) -> None:
    _session_tokens.discard(token)


def verify_token(token: str | None) -> bool:
    if not auth_required():
        return True
    if not token:
        return False
    return any(secrets.compare_digest(token, t) for t in _session_tokens)
