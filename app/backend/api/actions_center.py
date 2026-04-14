"""Routes for Actions Center page."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from backend import db_api
from backend.api.deps import GovernanceSql, get_governance_sql
from backend.api.models import BulkAcknowledgeBody
from backend.api.sql_utils import esc, rows_json_safe

execute_statement = db_api.execute_statement
run_query = db_api.run_query
TABLE_CONTROL_ACTIONS = db_api.TABLE_CONTROL_ACTIONS
TABLE_FILTERS = db_api.TABLE_FILTERS
TABLE_PENDING_APPROVALS = db_api.TABLE_PENDING_APPROVALS

router = APIRouter(tags=["actions"])


def _ensure_pending_approvals(conn, catalog: str, schema: str):
    full = f"{catalog}.{schema}.{TABLE_PENDING_APPROVALS}"
    execute_statement(
        conn,
        f"""CREATE TABLE IF NOT EXISTS {full} (
            violation_id STRING, approved_at TIMESTAMP, note STRING, created_at TIMESTAMP
        ) USING DELTA""",
    )


def _violation_ids_in_sql(violation_ids: list[str]) -> tuple[str, int]:
    cleaned = [str(x).strip() for x in violation_ids if str(x).strip()]
    if not cleaned:
        raise HTTPException(400, "violation_ids must be a non-empty list")
    return ", ".join(esc(x) for x in cleaned), len(cleaned)


@router.get("/api/actions")
def api_actions_list(
    workspace: Optional[str] = None,
    violation_type: Optional[str] = None,
    remediation_action: Optional[str] = None,
    gs: GovernanceSql = Depends(get_governance_sql),
):
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    filters = f"{catalog}.{schema}.{TABLE_FILTERS}"
    actions = f"{catalog}.{schema}.{TABLE_CONTROL_ACTIONS}"
    sql = f"""
        with multi_actions as (
            select remediation_action from {filters} group by all having count(*)>1
        )
        SELECT a.violation_id, a.workspace_id, a.object_id, date_format(a.created_at, 'yyyy-MM-dd HH:mm:ss') as event_time, a.object_type, a.object_name,
                a.violator_email as user_email, coalesce(filters_non_multi.violation_type, filters_multi.violation_type) as violation_type, a.action_type as remediation_action, a.remediation_status as processing_status,
                a.remediation_status as ca_status, a.retry_count, a.error_message, a.remediation_details
        FROM {actions} a
        left join (select distinct violation_type, remediation_action from {filters} where remediation_action not in (select remediation_action from multi_actions)) filters_non_multi
            on trim(a.action_type) = trim(filters_non_multi.remediation_action)
        left join (select distinct object_type, violation_type, remediation_action from {filters} where remediation_action in (select remediation_action from multi_actions)) filters_multi
            on trim(a.action_type) = trim(filters_multi.remediation_action) and trim(a.object_type) = trim(filters_multi.object_type)
        WHERE
        (a.remediation_status NOT IN ('SUCCESS', 'SKIPPED', 'SUCCESS_ACKNOWLEDGED')) or
        (a.remediation_status IN ('SUCCESS') and a.action_type like '%REPORT%')
        ORDER BY a.created_at ASC
    """
    try:
        df = run_query(conn, sql)
        df.columns = [str(c).lower() for c in df.columns]
        if workspace and workspace != "(all)" and "workspace_id" in df.columns:
            df = df[df["workspace_id"].astype(str) == workspace]
        if violation_type and violation_type != "(all)" and "violation_type" in df.columns:
            df = df[df["violation_type"].astype(str) == violation_type]
        if remediation_action and remediation_action != "(all)" and "remediation_action" in df.columns:
            df = df[df["remediation_action"].astype(str) == remediation_action]
        rows = df.to_dict("records")
        return {"rows": rows_json_safe(rows)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Actions query failed: {e}")


@router.post("/api/actions/bulk-acknowledge")
def api_actions_bulk_acknowledge(
    body: BulkAcknowledgeBody,
    gs: GovernanceSql = Depends(get_governance_sql),
):
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    _ensure_pending_approvals(conn, catalog, schema)
    actions = f"{catalog}.{schema}.{TABLE_CONTROL_ACTIONS}"
    in_sql, n = _violation_ids_in_sql(body.violation_ids)
    note = body.note if body.note is not None else ""
    try:
        execute_statement(
            conn,
            f"""UPDATE {actions} SET
                remediation_status = 'SUCCESS_ACKNOWLEDGED',
                remediation_details = concat(
                    coalesce(remediation_details, ''),
                    ' - Acknowledged by ',
                    current_user(),
                    ' with note: ',
                    {esc(note)}
                ),
                updated_at = current_timestamp()
                WHERE violation_id IN ({in_sql})""",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Bulk acknowledge failed: {e}")
    return {"ok": True, "requested": n}
