"""FastAPI dependencies: warehouse connection and governance SQL context."""
import os
from dataclasses import dataclass
from typing import Any, Generator, Optional

from fastapi import Depends, Header, HTTPException, Request

from config import get_catalog, get_schema, get_warehouse_http_path

from backend import db_api

get_connection = db_api.get_connection


@dataclass
class GovernanceSql:
    conn: Any
    catalog: str
    schema: str


def _catalog_header(x: Optional[str] = Header(None, alias="X-Catalog")) -> str:
    return (x or "").strip() or get_catalog()


def _schema_header(x: Optional[str] = Header(None, alias="X-Schema")) -> str:
    return (x or "").strip() or get_schema()


def _http_path_header(x: Optional[str] = Header(None, alias="X-Warehouse-HTTP-Path")) -> str:
    return (x or "").strip() or get_warehouse_http_path()


def get_governance_sql(
    request: Request,
    catalog: str = Depends(_catalog_header),
    schema: str = Depends(_schema_header),
    http_path: str = Depends(_http_path_header),
    x_forwarded_access_token: Optional[str] = Header(None, alias="X-Forwarded-Access-Token"),
    authorization: Optional[str] = Header(None),
) -> Generator[GovernanceSql, None, None]:
    """SQL warehouse connection using user token (OBO) when present, else SDK auth (local dev)."""
    if not catalog or not schema or not http_path:
        raise HTTPException(400, "Set X-Catalog, X-Schema, X-Warehouse-HTTP-Path or env vars.")
    token = (x_forwarded_access_token or "").strip()
    if not token and authorization:
        auth = authorization.strip()
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
    use_obo = bool(token)
    require_obo = os.environ.get("GOVERNANCE_REQUIRE_OBO", "").strip().lower() in ("1", "true", "yes")
    if require_obo and not use_obo:
        raise HTTPException(
            401,
            "User authorization required: X-Forwarded-Access-Token or Authorization Bearer "
            "(enable user authorization and the sql scope on the Databricks app).",
        )
    host_override = None
    if use_obo and not (os.environ.get("DATABRICKS_HOST") or "").strip():
        host_override = (request.headers.get("x-forwarded-host") or "").strip()
    try:
        conn = get_connection(
            http_path,
            access_token=token if use_obo else None,
            host_override=host_override or None,
            catalog=catalog,
            schema=schema,
        )
    except Exception as e:
        raise HTTPException(
            502,
            f"Could not connect to Databricks: {db_api.format_sql_driver_error(e)}",
        )
    try:
        yield GovernanceSql(conn=conn, catalog=catalog, schema=schema)
    finally:
        if use_obo:
            try:
                conn.close()
            except Exception:
                pass
