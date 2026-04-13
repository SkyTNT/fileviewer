import os
import time
import secrets

# token -> expiry timestamp (unix seconds)
_session_tokens: dict[str, float] = {}
TOKEN_EXPIRY = 86400 * 30  # 30 days


def auth_required() -> bool:
    return bool(os.environ.get("FILE_VIEWER_USER"))


def check_credentials(username: str, password: str) -> bool:
    user = os.environ.get("FILE_VIEWER_USER", "")
    pwd  = os.environ.get("FILE_VIEWER_PASS", "")
    return secrets.compare_digest(username, user) and secrets.compare_digest(password, pwd)


def _purge_expired() -> None:
    now = time.time()
    expired = [t for t, exp in _session_tokens.items() if exp <= now]
    for t in expired:
        del _session_tokens[t]


def create_token() -> str:
    _purge_expired()
    token = secrets.token_hex(32)
    _session_tokens[token] = time.time() + TOKEN_EXPIRY
    return token


def revoke_token(token: str) -> None:
    _session_tokens.pop(token, None)


def verify_token(token: str | None) -> bool:
    if not auth_required():
        return True
    if not token:
        return False
    now = time.time()
    return any(
        secrets.compare_digest(token, t)
        for t, exp in _session_tokens.items()
        if exp > now
    )
