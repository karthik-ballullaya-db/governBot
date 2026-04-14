"""Routes used app-wide: env config and current user (layout / shell)."""
import base64
import json
from typing import Optional

from fastapi import APIRouter, Header, Request

from config import get_catalog, get_schema, get_warehouse_http_path

router = APIRouter(tags=["common"])


def _jwt_payload_unverified(token: str) -> dict:
    """Parse JWT payload without verifying signature (display-only; token already from trusted proxy)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        body = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(body.encode("ascii")))
    except Exception:
        return {}


@router.get("/api/config")
def api_config():
    return {
        "catalog": get_catalog(),
        "schema": get_schema(),
        "warehouse_http_path": get_warehouse_http_path() or "",
    }


@router.get("/api/me")
def api_me(
    request: Request,
    x_forwarded_access_token: Optional[str] = Header(None, alias="X-Forwarded-Access-Token"),
    authorization: Optional[str] = Header(None),
):
    """Current user for UI: proxy headers and/or JWT claims (Databricks Apps / local Bearer)."""
    email = (request.headers.get("x-forwarded-email") or "").strip()
    hdr_name = (request.headers.get("x-forwarded-name") or "").strip()
    token = (x_forwarded_access_token or "").strip()
    if not token and authorization:
        auth = authorization.strip()
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
    payload = _jwt_payload_unverified(token) if token else {}
    if not email:
        email = (
            str(payload.get("email") or payload.get("upn") or payload.get("preferred_username") or "")
        ).strip()
    given = str(payload.get("given_name") or "").strip()
    family = str(payload.get("family_name") or "").strip()
    full_name = hdr_name or str(payload.get("name") or "").strip()
    if not full_name and (given or family):
        full_name = f"{given} {family}".strip()
    if not full_name and email:
        local = email.split("@")[0]
        full_name = local.replace(".", " ").replace("_", " ").title()
    return {
        "email": email,
        "name": full_name,
        "given_name": given or None,
    }
