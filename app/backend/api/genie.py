"""Genie Space chat: GET /api/genie/space, POST /api/genie/ask, POST /api/genie/ask/stream.

Talks to a Databricks Genie Space via the SDK Conversations API on the user's
behalf (OBO). The space is configured by ``GENIE_SPACE_ID`` env var, with a
per-user override via ``X-Genie-Space-Id`` or the request body ``space_id``.

The /stream variant returns Server-Sent Events emitting `started`, `status`,
`step`, `final`, `error` events as Genie progresses through its response.
"""
import json
import os
import time
from typing import Any, Iterator, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

from config import get_genie_space_id

from backend.api.models import (
    GenieAskRequest,
    GenieAskResponse,
    GenieQueryResult,
    GenieSpaceInfo,
    GenieStep,
)

router = APIRouter(tags=["genie"])

_MAX_ROWS = 1000


def _user_token(
    x_forwarded_access_token: Optional[str], authorization: Optional[str]
) -> str:
    token = (x_forwarded_access_token or "").strip()
    if not token and authorization:
        auth = authorization.strip()
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
    return token


def _resolved_host(request: Request) -> Optional[str]:
    host = (os.environ.get("DATABRICKS_HOST") or "").strip()
    if host:
        return host
    fwd = (request.headers.get("x-forwarded-host") or "").strip()
    if fwd:
        return f"https://{fwd}" if not fwd.startswith("http") else fwd
    return None


_FOLLOWUP_FIELDS = (
    "suggested_followups",
    "suggested_followup_questions",
    "followups",
    "followup_questions",
    "follow_ups",
    "suggested_questions",
)

# Text attachments that are *purely* a follow-up question — Genie often emits
# these as a final separate text attachment rather than via a structured field.
_FOLLOWUP_STARTERS = (
    "would you",
    "would it",
    "would like",
    "do you want",
    "do you",
    "should i",
    "shall i",
    "are you",
    "could i",
    "want me",
    "want to",
    "is there anything",
    "is there a specific",
    "any specific",
    "interested in",
    "may i",
    "can i",
    "let me know",
)


def _looks_like_followup_text(content: str) -> bool:
    """True if a text attachment is *purely* a short follow-up question."""
    s = (content or "").strip()
    if not s or len(s) > 280:
        return False
    if not s.endswith("?"):
        return False
    if "\n\n" in s:  # multi-paragraph → likely the main answer with a trailing q
        return False
    sl = s.lower()
    return any(sl.startswith(p) for p in _FOLLOWUP_STARTERS)


def _coerce_followup_item(item: Any) -> Optional[str]:
    if isinstance(item, str):
        s = item.strip()
        return s or None
    if isinstance(item, dict):
        for k in ("question", "text", "content", "value"):
            v = item.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return None
    for k in ("question", "text", "content", "value"):
        v = getattr(item, k, None)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _collect_followups_from(obj: Any, out: list[str]) -> None:
    if obj is None:
        return
    for field in _FOLLOWUP_FIELDS:
        v = obj.get(field) if isinstance(obj, dict) else getattr(obj, field, None)
        if not v:
            continue
        if isinstance(v, (list, tuple)):
            for item in v:
                s = _coerce_followup_item(item)
                if s:
                    out.append(s)
        else:
            s = _coerce_followup_item(v)
            if s:
                out.append(s)


def _merge_followups(*lists: list[str]) -> list[str]:
    """Concatenate followup lists in order, dedup case-insensitively, preserve order."""
    seen: set[str] = set()
    out: list[str] = []
    for lst in lists:
        for q in lst or []:
            s = (q or "").strip()
            if not s:
                continue
            key = s.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(s)
    return out


def _extract_followups(message: Any) -> list[str]:
    """Pull suggested follow-up questions from a GenieMessage (defensive across SDK shapes)."""
    out: list[str] = []
    _collect_followups_from(message, out)
    for att in (getattr(message, "attachments", None) or []):
        _collect_followups_from(att, out)
        _collect_followups_from(getattr(att, "text", None), out)
        _collect_followups_from(getattr(att, "query", None), out)
    # Dedupe preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for q in out:
        if q not in seen:
            seen.add(q)
            deduped.append(q)
    return deduped


def _normalize_status(value: Any) -> str:
    """Normalize SDK status (enum or string) to a bare uppercase token.

    Databricks SDK returns ``status`` as a ``MessageStatus`` enum whose ``str()`` is
    ``"MessageStatus.COMPLETED"``. We want plain ``"COMPLETED"``.
    """
    if value is None:
        return ""
    v = getattr(value, "value", None)
    if isinstance(v, str) and v:
        return v.upper()
    s = str(value)
    if "." in s:
        s = s.rsplit(".", 1)[-1]
    return s.strip().upper()


def _workspace_client(token: str, host: Optional[str]):
    """Build a Databricks SDK WorkspaceClient using the user's token (OBO)."""
    try:
        from databricks.sdk import WorkspaceClient
    except Exception as e:
        raise HTTPException(500, f"databricks-sdk import failed: {e}")
    kwargs: dict[str, Any] = {"token": token, "auth_type": "pat"}
    if host:
        kwargs["host"] = host
    try:
        return WorkspaceClient(**kwargs)
    except Exception as e:
        raise HTTPException(502, f"Could not initialize Databricks SDK: {e}")


def _get(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    v = getattr(obj, key, None)
    if v is not None:
        return v
    # Some SDK objects (Wait wrappers, dataclasses) only expose values via as_dict / __dict__.
    as_dict_fn = getattr(obj, "as_dict", None)
    if callable(as_dict_fn):
        try:
            d = as_dict_fn()
            if isinstance(d, dict) and key in d:
                return d[key]
        except Exception:
            pass
    try:
        d = vars(obj)
        if isinstance(d, dict) and key in d:
            return d[key]
    except Exception:
        pass
    return default


def _fetch_message_dict(
    w: Any, space_id: str, conversation_id: str, message_id: str
) -> Optional[dict]:
    """Fetch the GenieMessage as a raw JSON dict via REST (so attachment_id is reliable
    regardless of SDK version). Returns None on failure."""
    try:
        result = w.api_client.do(
            method="GET",
            path=f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}",
        )
        return result if isinstance(result, dict) else None
    except Exception:
        return None


_QUERY_TERMINAL_STATES = {"SUCCEEDED", "FAILED", "CANCELED", "CLOSED"}
_QUERY_POLL_INTERVAL_S = 0.5
_QUERY_MAX_POLL_S = 120


def _statement_state(qr: Any) -> str:
    stmt = _get(qr, "statement_response")
    status = _get(stmt, "status")
    state = _get(status, "state")
    return str(state or "").upper()


def _statement_error(qr: Any) -> Optional[str]:
    stmt = _get(qr, "statement_response")
    status = _get(stmt, "status")
    err = _get(status, "error")
    if err is None:
        return None
    msg = _get(err, "message") or _get(err, "error") or str(err)
    return str(msg) if msg else None


def _run_attachment_query(
    w: Any, space_id: str, conversation_id: str, message_id: str, attachment_id: str
) -> Any:
    """Run the SQL embedded in a Genie query attachment via raw REST.

    SDK method names for Genie evolve across versions (executeMessageAttachmentQuery,
    executeMessageQuery, etc.) but the REST API is stable, so we hit it directly.

    Flow:
      1. POST .../attachments/{attachment_id}/execute-query  (newer per-attachment endpoint;
         https://docs.databricks.com/api/workspace/genie/executemessageattachmentquery)
         If that returns a 4xx, try the older per-message ``.../execute-query``.
      2. Poll GET .../query-result/{attachment_id} (or .../query-result for older API)
         until Statement Execution status state is terminal
         (SUCCEEDED/FAILED/CANCELED/CLOSED), with a 120s deadline.
      3. Surface FAILED/CANCELED as a clear error string.

    Returns the parsed JSON dict on success, or an error string on failure.
    """
    base = (
        f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}"
    )

    # Try per-attachment endpoint first (newer API), then fall back to per-message.
    candidates: list[tuple[str, str]] = []
    if attachment_id:
        candidates.append(
            (f"{base}/attachments/{attachment_id}/execute-query", f"{base}/query-result/{attachment_id}")
        )
    candidates.append((f"{base}/execute-query", f"{base}/query-result"))

    last_err: Optional[str] = None
    for execute_path, get_path in candidates:
        qr: Any = None
        try:
            qr = w.api_client.do(method="POST", path=execute_path)
        except Exception as e:
            last_err = f"POST {execute_path}: {e}"
            continue  # try next candidate path

        # Poll the GET endpoint until the statement reaches a terminal state.
        deadline = time.monotonic() + _QUERY_MAX_POLL_S
        timed_out = False
        while True:
            state = _statement_state(qr)
            if state in _QUERY_TERMINAL_STATES:
                break
            if time.monotonic() > deadline:
                last_err = f"Query did not finish in {_QUERY_MAX_POLL_S}s (state={state or 'unknown'})"
                timed_out = True
                break
            try:
                qr = w.api_client.do(method="GET", path=get_path)
            except Exception as e:
                last_err = f"GET {get_path}: {e}"
                qr = None
                break
            if _statement_state(qr) in _QUERY_TERMINAL_STATES:
                break
            time.sleep(_QUERY_POLL_INTERVAL_S)

        if timed_out or qr is None:
            continue  # try next candidate path

        state = _statement_state(qr)
        if state in {"FAILED", "CANCELED"}:
            msg = _statement_error(qr) or state
            last_err = f"Query {state.lower()}: {msg}"
            continue  # try next candidate path
        return qr

    return last_err or "Genie query execution failed"


def _extract_query_rows(qr: Any) -> tuple[list[str], list[list[Any]], bool, int]:
    """Pull (columns, rows, truncated, row_count) out of a Genie query-result.

    Handles both raw dicts (from api_client.do) and typed SDK objects.
    """
    columns: list[str] = []
    rows: list[list[Any]] = []
    truncated = False
    row_count = 0

    stmt = _get(qr, "statement_response")
    if stmt is None:
        return columns, rows, truncated, row_count

    manifest = _get(stmt, "manifest")
    schema = _get(manifest, "schema")
    schema_cols = _get(schema, "columns")
    if schema_cols:
        columns = [(_get(c, "name") or "") for c in schema_cols]

    result = _get(stmt, "result")
    data = _get(result, "data_array")
    if data:
        if len(data) > _MAX_ROWS:
            rows = [list(r) for r in data[:_MAX_ROWS]]
            truncated = True
        else:
            rows = [list(r) for r in data]
        row_count = len(data)

    return columns, rows, truncated, row_count


def _flatten_attachments(message: Any, w: Any, space_id: str, conversation_id: str, message_id: str):
    """Walk a GenieMessage's attachments: emit ordered steps, plus a flattened
    text + final query result for the main bubble. Trailing follow-up
    questions are stripped from the main text and returned separately.

    `message` may be either a typed SDK object or a raw dict (from REST).
    """
    text_parts: list[str] = []
    text_followups: list[str] = []
    query: Optional[GenieQueryResult] = None
    steps: list[GenieStep] = []

    attachments = _get(message, "attachments") or []
    for att in attachments:
        # Text attachment
        text_att = _get(att, "text")
        if text_att is not None:
            content = _get(text_att, "content") or ""
            title = _get(text_att, "title")
            if _looks_like_followup_text(content):
                # Genie sometimes emits a follow-up as its own short text attachment;
                # treat it as a clickable follow-up rather than part of the answer.
                text_followups.append(content.strip())
                steps.append(
                    GenieStep(type="text", title=title or "Follow-up", content=content or None)
                )
                continue
            if content:
                text_parts.append(content)
            steps.append(GenieStep(type="text", title=title, content=content or None))
            continue

        # Query attachment — fetch the executed result rows
        query_att = _get(att, "query")
        if query_att is None:
            continue
        attachment_id = (
            _get(att, "attachment_id")
            or _get(att, "id")
            or _get(query_att, "attachment_id")
            or _get(query_att, "id")
        )
        statement_sql = _get(query_att, "query") or ""
        description = _get(query_att, "description") or ""
        title = _get(query_att, "title")
        if description and not statement_sql:
            statement_sql = description

        columns: list[str] = []
        rows: list[list[Any]] = []
        truncated = False
        row_count = 0
        fetch_error: Optional[str] = None

        if attachment_id:
            qr = _run_attachment_query(
                w, space_id, conversation_id, message_id, attachment_id
            )
            if isinstance(qr, str):
                fetch_error = qr
            else:
                columns, rows, truncated, row_count = _extract_query_rows(qr)
                # SDK reachable but no manifest/result — flag it instead of silently rendering nothing.
                if not columns and not rows:
                    state = _statement_state(qr) or "unknown"
                    fetch_error = f"empty result (statement state={state})"
        elif statement_sql:
            fetch_error = "no attachment_id; cannot run query"

        if fetch_error is not None:
            text_parts.append(f"_(Could not fetch query results: {fetch_error})_")

        query = GenieQueryResult(
            statement=statement_sql,
            columns=columns,
            rows=rows,
            row_count=row_count,
            truncated=truncated,
        )
        steps.append(
            GenieStep(
                type="query",
                title=title,
                description=description or None,
                statement=statement_sql or None,
                row_count=row_count if row_count else None,
            )
        )

    return ("\n\n".join(text_parts) or None), query, steps, text_followups


@router.get("/api/genie/space", response_model=GenieSpaceInfo)
def api_genie_space(
    x_genie_space_id: Optional[str] = Header(None, alias="X-Genie-Space-Id"),
):
    space_id = (x_genie_space_id or "").strip() or get_genie_space_id()
    return GenieSpaceInfo(space_id=space_id, configured=bool(space_id))


@router.post("/api/genie/ask", response_model=GenieAskResponse)
def api_genie_ask(
    body: GenieAskRequest,
    request: Request,
    x_genie_space_id: Optional[str] = Header(None, alias="X-Genie-Space-Id"),
    x_forwarded_access_token: Optional[str] = Header(None, alias="X-Forwarded-Access-Token"),
    authorization: Optional[str] = Header(None),
):
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(400, "question is required")

    space_id = (
        (body.space_id or "").strip()
        or (x_genie_space_id or "").strip()
        or get_genie_space_id()
    )
    if not space_id:
        raise HTTPException(
            400,
            "Genie space is not configured: set GENIE_SPACE_ID env var or send X-Genie-Space-Id.",
        )

    token = _user_token(x_forwarded_access_token, authorization)
    require_obo = os.environ.get("GOVERNANCE_REQUIRE_OBO", "").strip().lower() in ("1", "true", "yes")
    if require_obo and not token:
        raise HTTPException(
            401,
            "User authorization required: X-Forwarded-Access-Token or Authorization Bearer "
            "(enable user authorization and the dashboards.genie scope on the Databricks app).",
        )

    w = _workspace_client(token, _resolved_host(request))

    try:
        if body.conversation_id:
            message = w.genie.create_message_and_wait(
                space_id=space_id,
                conversation_id=body.conversation_id,
                content=question,
            )
        else:
            message = w.genie.start_conversation_and_wait(
                space_id=space_id,
                content=question,
            )
    except Exception as e:
        raise HTTPException(502, f"Genie API call failed: {e}")

    conversation_id = (
        getattr(message, "conversation_id", None) or body.conversation_id or ""
    )
    message_id = getattr(message, "id", None) or getattr(message, "message_id", None) or ""
    status = _normalize_status(getattr(message, "status", None))
    error_text = getattr(message, "error", None)
    error_str: Optional[str] = None
    if error_text is not None:
        error_str = getattr(error_text, "error", None) or str(error_text)

    msg_for_flatten = _fetch_message_dict(w, space_id, conversation_id, message_id) or message
    text, query, steps, text_followups = _flatten_attachments(
        msg_for_flatten, w, space_id, conversation_id, message_id
    )
    followups = _merge_followups(_extract_followups(msg_for_flatten), text_followups)

    return GenieAskResponse(
        conversation_id=conversation_id,
        message_id=message_id,
        status=status,
        text=text,
        query=query,
        steps=steps,
        followups=followups,
        error=error_str,
    )


# --- Streaming -------------------------------------------------------------

_TERMINAL_STATUSES = {"COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"}
_POLL_INTERVAL_S = 0.6
_MAX_POLL_SECONDS = 300


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


def _attachment_step_preview(att: Any) -> Optional[GenieStep]:
    """Build a GenieStep preview from a single attachment object (no result fetch yet)."""
    text_att = getattr(att, "text", None)
    if text_att is not None:
        content = getattr(text_att, "content", None) or ""
        title = getattr(text_att, "title", None)
        return GenieStep(type="text", title=title, content=content or None)
    query_att = getattr(att, "query", None)
    if query_att is not None:
        return GenieStep(
            type="query",
            title=getattr(query_att, "title", None),
            description=getattr(query_att, "description", None) or None,
            statement=getattr(query_att, "query", None) or None,
        )
    return None


def _start_or_continue_raw(w: Any, space_id: str, conversation_id: Optional[str], question: str) -> tuple[str, str]:
    """Kick off Genie via raw REST (avoids the SDK Wait pattern). Returns (conversation_id, message_id)."""
    if conversation_id:
        path = f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages"
    else:
        path = f"/api/2.0/genie/spaces/{space_id}/start-conversation"
    init = w.api_client.do(method="POST", path=path, body={"content": question})
    if not isinstance(init, dict):
        init = {}
    cid = init.get("conversation_id") or conversation_id or ""
    mid = init.get("message_id") or ((init.get("message") or {}).get("id") if isinstance(init.get("message"), dict) else "") or ""
    if not cid or not mid:
        raise HTTPException(502, f"Genie did not return conversation/message ids: {init}")
    return cid, mid


@router.post("/api/genie/ask/stream")
def api_genie_ask_stream(
    body: GenieAskRequest,
    request: Request,
    x_genie_space_id: Optional[str] = Header(None, alias="X-Genie-Space-Id"),
    x_forwarded_access_token: Optional[str] = Header(None, alias="X-Forwarded-Access-Token"),
    authorization: Optional[str] = Header(None),
):
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(400, "question is required")

    space_id = (
        (body.space_id or "").strip()
        or (x_genie_space_id or "").strip()
        or get_genie_space_id()
    )
    if not space_id:
        raise HTTPException(
            400,
            "Genie space is not configured: set GENIE_SPACE_ID env var or send X-Genie-Space-Id.",
        )

    token = _user_token(x_forwarded_access_token, authorization)
    require_obo = os.environ.get("GOVERNANCE_REQUIRE_OBO", "").strip().lower() in ("1", "true", "yes")
    if require_obo and not token:
        raise HTTPException(
            401,
            "User authorization required: X-Forwarded-Access-Token or Authorization Bearer "
            "(enable user authorization and the dashboards.genie scope on the Databricks app).",
        )

    w = _workspace_client(token, _resolved_host(request))
    convo_id_in = (body.conversation_id or "").strip() or None

    def gen() -> Iterator[str]:
        try:
            conversation_id, message_id = _start_or_continue_raw(w, space_id, convo_id_in, question)
        except HTTPException as e:
            yield _sse({"type": "error", "error": e.detail})
            return
        except Exception as e:
            yield _sse({"type": "error", "error": f"Genie start failed: {e}"})
            return

        yield _sse({
            "type": "started",
            "conversation_id": conversation_id,
            "message_id": message_id,
        })

        last_status: Optional[str] = None
        seen_count = 0  # attachments are append-only; positional dedup is stable
        deadline = time.monotonic() + _MAX_POLL_SECONDS
        last_message: Any = None

        while True:
            if time.monotonic() > deadline:
                yield _sse({"type": "error", "error": "Timed out waiting for Genie response."})
                return
            try:
                msg = w.genie.get_message(
                    space_id=space_id,
                    conversation_id=conversation_id,
                    message_id=message_id,
                )
            except Exception as e:
                yield _sse({"type": "error", "error": f"Genie poll failed: {e}"})
                return

            last_message = msg
            status = _normalize_status(getattr(msg, "status", None))
            if status and status != last_status:
                yield _sse({"type": "status", "status": status})
                last_status = status

            attachments = getattr(msg, "attachments", None) or []
            if len(attachments) > seen_count:
                for i in range(seen_count, len(attachments)):
                    step = _attachment_step_preview(attachments[i])
                    if step is not None:
                        yield _sse({"type": "step", "step": step.model_dump()})
                seen_count = len(attachments)

            if status in _TERMINAL_STATUSES:
                break

            time.sleep(_POLL_INTERVAL_S)

        # Build the final response (re-walks attachments and fetches query results).
        # Refetch the message as a raw dict so attachment_id is reliable.
        msg_for_flatten = (
            _fetch_message_dict(w, space_id, conversation_id, message_id) or last_message
        )
        try:
            text, query, steps, text_followups = _flatten_attachments(
                msg_for_flatten, w, space_id, conversation_id, message_id
            )
        except Exception as e:
            yield _sse({"type": "error", "error": f"Failed to assemble final response: {e}"})
            return

        err_obj = _get(msg_for_flatten, "error")
        error_str: Optional[str] = None
        if err_obj is not None:
            error_str = _get(err_obj, "error") or _get(err_obj, "message") or str(err_obj)

        followups = _merge_followups(_extract_followups(msg_for_flatten), text_followups)
        final = GenieAskResponse(
            conversation_id=conversation_id,
            message_id=message_id,
            status=last_status or "",
            text=text,
            query=query,
            steps=steps,
            followups=followups,
            error=error_str,
        )
        yield _sse({"type": "final", "response": final.model_dump()})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
