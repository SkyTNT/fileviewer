from fastapi import APIRouter, Response, Cookie, HTTPException
from pydantic import BaseModel
from fileviewer import auth_state

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.get("/status")
def status(fv_token: str | None = Cookie(None)):
    required = auth_state.auth_required()
    return {
        "auth_required": required,
        "logged_in": not required or auth_state.verify_token(fv_token),
    }


@router.post("/login")
def login(req: LoginRequest, response: Response):
    if not auth_state.check_credentials(req.username, req.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = auth_state.create_token()
    response.set_cookie(
        "fv_token", token,
        httponly=True,
        samesite="strict",
        max_age=86400 * 30,  # 30 days
    )
    return {"ok": True}


@router.post("/logout")
def logout(response: Response, fv_token: str | None = Cookie(None)):
    if fv_token:
        auth_state.revoke_token(fv_token)
    response.delete_cookie("fv_token")
    return {"ok": True}
