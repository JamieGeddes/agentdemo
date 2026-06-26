"""Bearer-token decode tests — must stay byte-compatible with the server's
mintToken (packages/shared/src/token.ts)."""

import base64
import json

from app.caller import Caller, current_caller, decode_token, get_caller, get_role, mint_token


def test_token_round_trip():
    token = mint_token("u1", "Dana Admin", "admin")
    caller = decode_token(token)
    assert caller == Caller(user_id="u1", user_name="Dana Admin", role="admin")


def test_accepts_authorization_header_value():
    token = mint_token("u2", "Morgan Manager", "manager")
    assert decode_token(f"Bearer {token}").role == "manager"


def test_rejects_empty_and_malformed():
    assert decode_token(None) is None
    assert decode_token("") is None
    assert decode_token("garbage") is None


def test_rejects_unknown_role():
    def enc(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    bad = f'{enc({"alg": "none"})}.{enc({"sub": "x", "name": "X", "role": "root"})}.demo'
    assert decode_token(bad) is None


def test_get_role_defaults_to_readonly_and_reads_context():
    assert get_role() == "readonly"
    token = current_caller.set(Caller("u1", "Dana", "admin"))
    try:
        assert get_role() == "admin"
        assert get_caller().user_name == "Dana"
    finally:
        current_caller.reset(token)
