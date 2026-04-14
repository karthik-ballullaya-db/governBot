"""
GovernBot FastAPI backend: config, summary, actions, configs (workspaces, identities, filters).

Data routes use the Databricks SQL connector with user authorization (OBO) when
``X-Forwarded-Access-Token`` or ``Authorization: Bearer`` is present (Databricks Apps
forwards the user token). Otherwise unified SDK auth is used (e.g. local dev with
a CLI profile). Set ``GOVERNANCE_REQUIRE_OBO=1`` to reject requests without a user token.

All routes accept X-Catalog, X-Schema, X-Warehouse-HTTP-Path headers (or env defaults).

HTTP handlers live under ``backend.api`` grouped by UI area.
"""
import os
import sys
from contextlib import asynccontextmanager

# Add parent app dir for config (so "from config" works when running from app/)
_APP_DIR = os.path.join(os.path.dirname(__file__), "..")
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse

from backend.api import actions_center, common, configs, summary

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # cleanup if needed


app = FastAPI(title="GovernBot API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(common.router)
app.include_router(summary.router)
app.include_router(actions_center.router)
app.include_router(configs.router)

# Serve React build when present; always serve index.html for SPA routes so /summary, /configs etc. don't 404
# Resolve to absolute path so it works regardless of process cwd (e.g. run from app/ vs repo root).
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(static_dir):
    _assets_dir = os.path.join(static_dir, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    """Catch-all for SPA: return index.html for non-API paths so client-side routing works."""
    if full_path.startswith("api/"):
        raise HTTPException(404)
    index = os.path.join(static_dir, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return HTMLResponse(
        "<!DOCTYPE html><html><head><title>GovernBot</title></head><body style='font-family:system-ui;background:#0F172A;color:#E2E8F0;padding:2rem;'>"
        "<h1>GovernBot API</h1><p>The API is running. Use <strong>/api/config</strong>, <strong>/api/summary</strong>, "
        "<strong>/api/actions</strong>, <strong>/api/configs/workspaces</strong>, etc.</p>"
        "<p>To serve the React UI, build the frontend (<code>cd frontend && npm run build</code>) and deploy the <code>frontend/dist</code> folder with the app.</p>"
        "</body></html>",
        status_code=200,
    )
