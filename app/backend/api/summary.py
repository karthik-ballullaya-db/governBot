"""Routes for Summary dashboard page."""
import math
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from backend import db_api
from backend.api.deps import GovernanceSql, get_governance_sql
from backend.api.models import SummaryResponse, SummaryTrendResponse
from backend.api.sql_utils import (
    NUM_TREND_PERIODS,
    pct_change_vs_previous,
    remediation_type_sql_filter,
    rows_json_safe,
)

run_query = db_api.run_query
TABLE_CONTROL_ACTIONS = db_api.TABLE_CONTROL_ACTIONS
TABLE_FILTERS = db_api.TABLE_FILTERS

router = APIRouter(tags=["summary"])


def _int_count(v) -> int:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 0
    return int(v)


@router.get("/api/summary")
def api_summary(
    hours: int = 24,
    remediation_type: str = "ALL",
    gs: GovernanceSql = Depends(get_governance_sql),
):
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    filters = f"{catalog}.{schema}.{TABLE_FILTERS}"
    actions = f"{catalog}.{schema}.{TABLE_CONTROL_ACTIONS}"
    interval_sql = f"current_timestamp() - INTERVAL '{hours}' HOUR"
    interval_2h_sql = f"current_timestamp() - INTERVAL '{hours * 2}' HOUR"
    remediation_filters = remediation_type_sql_filter(remediation_type)
    # Single detail scan over [now - 2*hours, now); summary_window splits current vs previous in Python.
    sql = f"""
        with multi_actions as (
            select remediation_action from {filters} group by all having count(*)>1
        )
        SELECT
            violation_id,
            workspace_id,
            actions.created_at as event_time,
            action_type,
            coalesce(filters_non_multi.violation_type, filters_multi.violation_type) as violation_type,
            actions.object_type,
            violator_email as user_email,
            object_name,
            remediation_status as processing_status,
            case when actions.created_at >= {interval_sql} then 'current' else 'previous' end as summary_window
        FROM {actions} actions
        left join (select distinct violation_type, remediation_action from {filters} where remediation_action not in (select remediation_action from multi_actions)) filters_non_multi
            on trim(actions.action_type) = trim(filters_non_multi.remediation_action)
        left join (select distinct object_type, violation_type, remediation_action from {filters} where remediation_action in (select remediation_action from multi_actions)) filters_multi
            on trim(actions.action_type) = trim(filters_multi.remediation_action) and trim(actions.object_type) = trim(filters_multi.object_type)
        WHERE actions.created_at >= {interval_2h_sql} {remediation_filters}
        ORDER BY actions.created_at DESC
    """
    # One scan of [now-2h, now]: current vs previous window counts (same remediation filter as headline stats)
    pending_case = (
        "case when remediation_status not in ('SUCCESS','SKIPPED','SUCCESS_ACKNOWLEDGED') then 1 else 0 end"
    )
    sql_status = f"""
        select
            sum(case when created_at >= {interval_sql} then 1 else 0 end) as cur_total,
            sum(case when created_at >= {interval_sql} then {pending_case} else 0 end) as cur_pending,
            sum(case when created_at >= {interval_2h_sql} and created_at < ({interval_sql}) then 1 else 0 end) as prev_total,
            sum(case when created_at >= {interval_2h_sql} and created_at < ({interval_sql}) then {pending_case} else 0 end) as prev_pending
        from {actions} actions
        where created_at >= {interval_2h_sql} {remediation_filters}"""
    try:
        df = run_query(conn, sql)
        df_status = run_query(conn, sql_status)
    except Exception as e:
        raise HTTPException(502, str(e))
    df.columns = [str(c).lower() for c in df.columns]
    win_col = "summary_window"
    if not df.empty and win_col in df.columns:
        w = df[win_col].astype(str).str.strip().str.lower()
        df_current = df.loc[w == "current"].drop(columns=[win_col], errors="ignore")
        df_previous = df.loc[w == "previous"].drop(columns=[win_col], errors="ignore")
    else:
        df_current = df.iloc[0:0]
        df_previous = df.iloc[0:0]
    df_status.columns = [str(c).lower() for c in df_status.columns]
    row_s = df_status.iloc[0]
    cur_total = _int_count(row_s["cur_total"])
    cur_pending = _int_count(row_s["cur_pending"])
    prev_total = _int_count(row_s["prev_total"])
    prev_pending = _int_count(row_s["prev_pending"])
    total, pending = cur_total, cur_pending
    completed = cur_total - cur_pending
    total_previous = prev_total
    pending_previous = prev_pending
    completed_previous = prev_total - prev_pending
    by_type = []
    if not df_current.empty and "violation_type" in df_current.columns:
        by_type = (
            df_current["violation_type"]
            .value_counts()
            .reset_index()
            .rename(columns={"violation_type": "name", "count": "count"})
        )
        by_type = by_type.to_dict("records")
    by_object_type = []
    if not df_current.empty and "object_type" in df_current.columns:
        by_object_type = (
            df_current["object_type"]
            .value_counts()
            .reset_index()
            .rename(columns={"object_type": "name", "count": "count"})
        )
        by_object_type = by_object_type.to_dict("records")
    by_type_previous: list[dict] = []
    if not df_previous.empty and "violation_type" in df_previous.columns:
        by_type_previous = (
            df_previous["violation_type"]
            .value_counts()
            .reset_index()
            .rename(columns={"violation_type": "name", "count": "count"})
        )
        by_type_previous = by_type_previous.to_dict("records")
    by_object_type_previous: list[dict] = []
    if not df_previous.empty and "object_type" in df_previous.columns:
        by_object_type_previous = (
            df_previous["object_type"]
            .value_counts()
            .reset_index()
            .rename(columns={"object_type": "name", "count": "count"})
        )
        by_object_type_previous = by_object_type_previous.to_dict("records")
    latest = (
        df_current.sort_values("event_time", ascending=False).head(50).to_dict("records")
        if not df_current.empty and "event_time" in df_current.columns
        else []
    )
    latest = rows_json_safe(latest)
    return SummaryResponse(
        total=total,
        pending=pending,
        completed=completed,
        total_previous=total_previous,
        pending_previous=pending_previous,
        completed_previous=completed_previous,
        pct_change_total=pct_change_vs_previous(total, total_previous),
        pct_change_pending=pct_change_vs_previous(pending, pending_previous),
        pct_change_completed=pct_change_vs_previous(completed, completed_previous),
        by_type=by_type,
        by_object_type=by_object_type,
        by_type_previous=by_type_previous,
        by_object_type_previous=by_object_type_previous,
        latest=latest,
    )


def _summary_trend_rows(
    conn,
    actions: str,
    hours: int,
    remediation_filters: str,
    window: str,
) -> list[dict]:
    """Build trend rows for ``current`` [now-h, now) or ``previous`` [now-2h, now-h)."""
    w = (window or "current").strip().lower()
    if w not in ("current", "previous"):
        raise HTTPException(400, "window must be 'current' or 'previous'")
    hours_clamped = hours
    interval_sql = f"current_timestamp() - INTERVAL '{hours_clamped}' HOUR"
    interval_2h_sql = f"current_timestamp() - INTERVAL '{hours_clamped * 2}' HOUR"
    range_sec = hours_clamped * 3600
    bucket_sec = range_sec / NUM_TREND_PERIODS
    trend: list[dict] = []

    if w == "current":
        anchor_sec = int(range_sec)
        where_clause = f"created_at >= {interval_sql} {remediation_filters}"
        label_base = datetime.now()
    else:
        anchor_sec = int(2 * range_sec)
        where_clause = f"created_at >= {interval_2h_sql} AND created_at < ({interval_sql}) {remediation_filters}"
        label_base = datetime.now() - timedelta(hours=hours_clamped)

    sql_query = f"""
            SELECT
                least({NUM_TREND_PERIODS}, greatest(0, abs(cast(floor(
                    (unix_timestamp(created_at) - unix_timestamp(current_timestamp())) / {bucket_sec}
                ) as int)))) - 1 AS period_idx,
                count(case when remediation_status NOT IN ('COMPLETED', 'SKIPPED') then 1 else null end) AS failed,
                count(*) AS generated
            FROM {actions} actions
            WHERE {where_clause}
            GROUP BY 1
    """

    def run_summary_trend():
        df = run_query(conn, sql_query)
        df.columns = [str(c).lower() for c in df.columns]
        return {
            int(row["period_idx"]): [int(row.get("generated", 0)), int(row.get("failed", 0))]
            for _, row in df.iterrows()
        }

    data = run_summary_trend()
    for period in range(NUM_TREND_PERIODS - 1, -1, -1):
        row = data.get(period, [0, 0])
        trend.append(
            {
                "period": (label_base - timedelta(seconds=period * bucket_sec)).strftime("%Y-%m-%d %H:%M"),
                "generated": row[0],
                "failed": row[1],
                "completed": row[0] - row[1],
            }
        )
    return trend


@router.get("/api/summary/trend")
def api_summary_trend(
    hours: int = 24,
    remediation_type: str = "ALL",
    window: str = "current",
    gs: GovernanceSql = Depends(get_governance_sql),
):
    """Time-series for the summary line chart: 5 equal intervals per window.

    ``window=current`` (default): [now - hours, now).
    ``window=previous``: the prior window of equal length (for comparison / PDF export).
    """
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    actions = f"{catalog}.{schema}.{TABLE_CONTROL_ACTIONS}"
    remediation_filters = remediation_type_sql_filter(remediation_type)
    try:
        trend = _summary_trend_rows(conn, actions, hours, remediation_filters, window)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, str(e))
    return SummaryTrendResponse(trend=trend)
