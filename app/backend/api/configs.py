"""Routes for Configs page: form options, workspaces, identities, filters."""
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException

from backend import db_api
from backend.form_options import (
    APPROVED_ACTION_GROUPS,
    DISCOVERY_OBJECT_TYPES,
    REMEDIATION_ACTIONS,
    VIOLATION_TYPES,
)
from backend.api.deps import GovernanceSql, get_governance_sql
from backend.api.models import FilterBody, IdentityBody, WorkspaceBody
from backend.api.sql_utils import arr_sql, esc, opt, rows_json_safe

execute_statement = db_api.execute_statement
run_query = db_api.run_query
TABLE_CONFIG_WORKSPACES = db_api.TABLE_CONFIG_WORKSPACES
TABLE_FILTERS = db_api.TABLE_FILTERS
TABLE_PREAPPROVED_IDENTITIES = db_api.TABLE_PREAPPROVED_IDENTITIES

router = APIRouter(tags=["configs"])


@router.get("/api/configs/form-options")
def api_configs_form_options():
    """Static form enums for the UI (see backend.form_options)."""
    return {
        "workspace_object_types": list(DISCOVERY_OBJECT_TYPES),
        "violation_types": list(VIOLATION_TYPES),
        "remediation_actions": list(REMEDIATION_ACTIONS),
        "approved_action_groups": APPROVED_ACTION_GROUPS,
    }


@router.get("/api/configs/workspaces")
def api_workspaces_list(gs: GovernanceSql = Depends(get_governance_sql)):
    try:
        conn = gs.conn
        catalog = gs.catalog
        schema = gs.schema
        full = f"{catalog}.{schema}.{TABLE_CONFIG_WORKSPACES}"
        df = run_query(conn, f"SELECT * FROM {full} order by workspace_id")
        df.columns = [str(c).lower() for c in df.columns]
        return {"rows": rows_json_safe(df.to_dict("records"))}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Workspaces query failed: {e}")


@router.post("/api/configs/workspaces")
def api_workspaces_create(body: WorkspaceBody, gs: GovernanceSql = Depends(get_governance_sql)):
    try:
        conn = gs.conn
        catalog = gs.catalog
        schema = gs.schema
        full = f"{catalog}.{schema}.{TABLE_CONFIG_WORKSPACES}"
        sql = f"""INSERT INTO {full} (workspace_id, workspace_name, workspace_url, warehouse_id, enforcement_enabled, notification_email, notification_slack_webhook, enabled_object_types, max_retry_attempts, created_at, updated_at, created_by)
    VALUES ({esc(body.workspace_id)}, {esc(body.workspace_name)}, {esc(body.workspace_url)}, {opt(body.warehouse_id)}, {str(body.enforcement_enabled).upper()}, {opt(body.notification_email)}, {opt(body.notification_slack_webhook)}, {arr_sql(body.enabled_object_types)}, {body.max_retry_attempts}, current_timestamp(), current_timestamp(), coalesce(current_user(), {esc(body.created_by)}))"""
        execute_statement(conn, sql)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Workspaces create failed: {e}")


@router.put("/api/configs/workspaces/{workspace_id}")
def api_workspaces_update(workspace_id: str, body: WorkspaceBody, gs: GovernanceSql = Depends(get_governance_sql)):
    try:
        conn = gs.conn
        catalog = gs.catalog
        schema = gs.schema
        full = f"{catalog}.{schema}.{TABLE_CONFIG_WORKSPACES}"
        sql = f"""UPDATE {full} SET workspace_name = {esc(body.workspace_name)}, workspace_url = {esc(body.workspace_url)}, warehouse_id = {opt(body.warehouse_id)}, enforcement_enabled = {str(body.enforcement_enabled).upper()}, notification_email = {opt(body.notification_email)}, notification_slack_webhook = {opt(body.notification_slack_webhook)}, enabled_object_types = {arr_sql(body.enabled_object_types)}, max_retry_attempts = {body.max_retry_attempts}, updated_at = current_timestamp(), created_by = coalesce(current_user(), {esc(body.created_by)}) WHERE workspace_id = {esc(workspace_id)}"""
        execute_statement(conn, sql)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Workspaces update failed: {e}")


@router.delete("/api/configs/workspaces/{workspace_id}")
def api_workspaces_delete(workspace_id: str, gs: GovernanceSql = Depends(get_governance_sql)):
    try:
        conn = gs.conn
        catalog = gs.catalog
        schema = gs.schema
        full = f"{catalog}.{schema}.{TABLE_CONFIG_WORKSPACES}"
        execute_statement(conn, f"DELETE FROM {full} WHERE workspace_id = {esc(workspace_id)}")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Workspaces delete failed: {e}")


@router.get("/api/configs/identities")
def api_identities_list(gs: GovernanceSql = Depends(get_governance_sql)):
    try:
        conn = gs.conn
        catalog = gs.catalog
        schema = gs.schema
        full = f"{catalog}.{schema}.{TABLE_PREAPPROVED_IDENTITIES}"
        df = run_query(conn, f"SELECT * FROM {full} order by identity_name")
        df.columns = [str(c).lower() for c in df.columns]
        return {"rows": rows_json_safe(df.to_dict("records"))}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Identities query failed: {e}")


@router.post("/api/configs/identities")
def api_identities_create(body: IdentityBody, gs: GovernanceSql = Depends(get_governance_sql)):
    try:
        conn = gs.conn
        catalog = gs.catalog
        schema = gs.schema
        full = f"{catalog}.{schema}.{TABLE_PREAPPROVED_IDENTITIES}"
        sql = f"""INSERT INTO {full} (identity_name, identity_type, display_name, can_manage_resources, can_manage_permissions, approved_actions, is_active, created_at, updated_at)
    VALUES ({esc(body.identity_name)}, {esc(body.identity_type)}, {esc(body.display_name)}, {str(body.can_manage_resources).upper()}, {str(body.can_manage_permissions).upper()}, {arr_sql(body.approved_actions)}, {str(body.is_active).upper()}, current_timestamp(), current_timestamp())"""
        execute_statement(conn, sql)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Identities create failed: {e}")


@router.put("/api/configs/identities/{identity_name}")
def api_identities_update(
    identity_name: str,
    body: IdentityBody,
    identity_type: str = Header(..., alias="X-Identity-Type"),
    gs: GovernanceSql = Depends(get_governance_sql),
):
    try:
        conn = gs.conn
        catalog = gs.catalog
        schema = gs.schema
        full = f"{catalog}.{schema}.{TABLE_PREAPPROVED_IDENTITIES}"
        sql = f"""UPDATE {full} SET display_name = {esc(body.display_name)}, can_manage_resources = {str(body.can_manage_resources).upper()}, can_manage_permissions = {str(body.can_manage_permissions).upper()}, approved_actions = {arr_sql(body.approved_actions)}, is_active = {str(body.is_active).upper()}, updated_at = current_timestamp() WHERE identity_name = {esc(identity_name)} AND identity_type = {esc(identity_type)}"""
        execute_statement(conn, sql)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Identities update failed: {e}")


@router.delete("/api/configs/identities/{identity_name}")
def api_identities_delete(
    identity_name: str,
    identity_type: str = Header(..., alias="X-Identity-Type"),
    gs: GovernanceSql = Depends(get_governance_sql),
):
    try:
        conn = gs.conn
        catalog = gs.catalog
        schema = gs.schema
        full = f"{catalog}.{schema}.{TABLE_PREAPPROVED_IDENTITIES}"
        execute_statement(
            conn,
            f"DELETE FROM {full} WHERE identity_name = {esc(identity_name)} AND identity_type = {esc(identity_type)}",
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Identities delete failed: {e}")


@router.get("/api/configs/filters")
def api_filters_list(gs: GovernanceSql = Depends(get_governance_sql)):
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    full = f"{catalog}.{schema}.{TABLE_FILTERS}"
    df = run_query(conn, f"SELECT * FROM {full} order by filter_name")
    df.columns = [str(c).lower() for c in df.columns]
    return {"rows": rows_json_safe(df.to_dict("records"))}


@router.post("/api/configs/filters")
def api_filters_create(body: FilterBody, gs: GovernanceSql = Depends(get_governance_sql)):
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    full = f"{catalog}.{schema}.{TABLE_FILTERS}"
    fid = body.filter_id or str(uuid.uuid4())
    sql = f"""INSERT INTO {full} (filter_id, filter_name, service_name, action_name, object_type, object_id_expr, object_name_expr, extra_columns, violation_type, remediation_action, is_active, description, created_at, updated_at)
    VALUES ({esc(fid)}, {esc(body.filter_name)}, {esc(body.service_name)}, {esc(body.action_name)}, {esc(body.object_type)}, {esc(body.object_id_expr)}, {esc(body.object_name_expr)}, map(), {esc(body.violation_type)}, {esc(body.remediation_action)}, {str(body.is_active).upper()}, {esc(body.description)}, current_timestamp(), current_timestamp())"""
    execute_statement(conn, sql)
    return {"ok": True}


@router.put("/api/configs/filters/{filter_id}")
def api_filters_update(filter_id: str, body: FilterBody, gs: GovernanceSql = Depends(get_governance_sql)):
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    full = f"{catalog}.{schema}.{TABLE_FILTERS}"
    sql = f"""UPDATE {full} SET filter_name = {esc(body.filter_name)}, service_name = {esc(body.service_name)}, action_name = {esc(body.action_name)}, object_type = {esc(body.object_type)}, object_id_expr = {esc(body.object_id_expr)}, object_name_expr = {esc(body.object_name_expr)}, violation_type = {esc(body.violation_type)}, remediation_action = {esc(body.remediation_action)}, is_active = {str(body.is_active).upper()}, description = {esc(body.description)}, updated_at = current_timestamp() WHERE filter_id = {esc(filter_id)}"""
    execute_statement(conn, sql)
    return {"ok": True}


@router.delete("/api/configs/filters/{filter_id}")
def api_filters_delete(filter_id: str, gs: GovernanceSql = Depends(get_governance_sql)):
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    full = f"{catalog}.{schema}.{TABLE_FILTERS}"
    execute_statement(conn, f"DELETE FROM {full} WHERE filter_id = {esc(filter_id)}")
    return {"ok": True}
