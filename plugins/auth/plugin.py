import os
import secrets
import threading
import time
from fastapi import APIRouter, Request, Response, Cookie, HTTPException
from pydantic import BaseModel

PLUGIN_ID = "auth"

TOKEN_EXPIRY = 86400 * 30
_session_tokens: dict[str, float] = {}
_tokens_lock = threading.Lock()


def _auth_required() -> bool:
    return bool(os.environ.get("FILE_VIEWER_USER", "").strip())


def _check_credentials(username: str, password: str) -> bool:
    expected_user = os.environ.get("FILE_VIEWER_USER", "")
    expected_pass = os.environ.get("FILE_VIEWER_PASS", "")
    return (
        secrets.compare_digest(username.encode(), expected_user.encode()) and
        secrets.compare_digest(password.encode(), expected_pass.encode())
    )


def _create_token() -> str:
    now = time.time()
    with _tokens_lock:
        expired = [t for t, exp in _session_tokens.items() if exp < now]
        for t in expired:
            del _session_tokens[t]
        token = secrets.token_hex(32)
        _session_tokens[token] = now + TOKEN_EXPIRY
    return token


def _verify_token(token: str | None) -> bool:
    if not token:
        return False
    now = time.time()
    with _tokens_lock:
        for stored, exp in _session_tokens.items():
            if exp >= now and secrets.compare_digest(token, stored):
                return True
    return False


def _revoke_token(token: str | None) -> None:
    if token:
        with _tokens_lock:
            _session_tokens.pop(token, None)


def _verify_request(request: Request) -> bool:
    if not _auth_required():
        return True
    token = request.cookies.get("fv_token")
    return _verify_token(token)


router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.get("/status")
def status(fv_token: str | None = Cookie(None)):
    required = _auth_required()
    return {
        "auth_required": required,
        "logged_in": not required or _verify_token(fv_token),
    }


@router.post("/login")
def login(req: LoginRequest, response: Response):
    if not _check_credentials(req.username, req.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = _create_token()
    response.set_cookie("fv_token", token, httponly=True, samesite="strict", max_age=TOKEN_EXPIRY)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response, fv_token: str | None = Cookie(None)):
    _revoke_token(fv_token)
    response.delete_cookie("fv_token")
    return {"ok": True}


async def setup(ctx):
    ctx.services.register("auth.verify", _verify_request, PLUGIN_ID)
    ctx.app.include_router(router, prefix="/api/auth", tags=["auth"])


async def teardown(ctx):
    ctx.services.unregister("auth.verify", PLUGIN_ID)
