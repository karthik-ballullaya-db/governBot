"""Routes for Summary dashboard page."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from backend import db_api
from backend.api.deps import GovernanceSql, get_governance_sql
from backend.api.models import SummaryResponse, SummaryTrendResponse
from backend.api.sql_utils import NUM_TREND_PERIODS, remediation_type_sql_filter, rows_json_safe

run_query = db_api.run_query
TABLE_CONTROL_ACTIONS = db_api.TABLE_CONTROL_ACTIONS
TABLE_FILTERS = db_api.TABLE_FILTERS

router = APIRouter(tags=["summary"])


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
    remediation_filters = remediation_type_sql_filter(remediation_type)
    sql = f"""
        with multi_actions as (
            select remediation_action from {filters} group by all having count(*)>1
        )
        SELECT violation_id, workspace_id, created_at as event_time, action_type, coalesce(filters_non_multi.violation_type, filters_multi.violation_type) as violation_type, actions.object_type, violator_email as user_email, object_name, remediation_status as processing_status
        FROM {actions} actions
        left join (select distinct violation_type, remediation_action from {filters} where remediation_action not in (select remediation_action from multi_actions)) filters_non_multi
            on trim(actions.action_type) = trim(filters_non_multi.remediation_action)
        left join (select distinct object_type, violation_type, remediation_action from {filters} where remediation_action in (select remediation_action from multi_actions)) filters_multi
            on trim(actions.action_type) = trim(filters_multi.remediation_action) and trim(actions.object_type) = trim(filters_multi.object_type)
        WHERE created_at >= {interval_sql} {remediation_filters}
        ORDER BY created_at DESC
    """
    sql_status = f"""
        select
            count(*) as total_violations,
            count(case when remediation_status not in ('SUCCESS','SKIPPED','SUCCESS_ACKNOWLEDGED') then 1 else null end) as pending_violations,
            total_violations - pending_violations as resolved_violations
        from {actions} actions
        where created_at >= {interval_sql} {remediation_filters}"""
    try:
        df = run_query(conn, sql)
        df_status = run_query(conn, sql_status)
    except Exception as e:
        raise HTTPException(502, str(e))
    df.columns = [str(c).lower() for c in df.columns]
    total, pending, completed = df_status.iloc[0]
    by_type = []
    if not df.empty and "violation_type" in df.columns:
        by_type = (
            df["violation_type"]
            .value_counts()
            .reset_index()
            .rename(columns={"violation_type": "name", "count": "count"})
        )
        by_type = by_type.to_dict("records")
    by_object_type = []
    if not df.empty and "object_type" in df.columns:
        by_object_type = (
            df["object_type"]
            .value_counts()
            .reset_index()
            .rename(columns={"object_type": "name", "count": "count"})
        )
        by_object_type = by_object_type.to_dict("records")
    latest = df.head(50).to_dict("records") if not df.empty else []
    latest = rows_json_safe(latest)
    return SummaryResponse(
        total=total,
        pending=pending,
        completed=completed,
        by_type=by_type,
        by_object_type=by_object_type,
        latest=latest,
    )


@router.get("/api/summary/trend")
def api_summary_trend(
    hours: int = 24,
    remediation_type: str = "ALL",
    gs: GovernanceSql = Depends(get_governance_sql),
):
    """Time-series for the summary line chart: 5 equal intervals, generated/resolved per period and running pending."""
    conn = gs.conn
    catalog = gs.catalog
    schema = gs.schema
    actions = f"{catalog}.{schema}.{TABLE_CONTROL_ACTIONS}"
    hours_clamped = hours
    interval_sql = f"current_timestamp() - INTERVAL '{hours_clamped}' HOUR"
    range_sec = hours_clamped * 3600
    bucket_sec = range_sec / NUM_TREND_PERIODS
    trend: list[dict] = []

    remediation_filters = remediation_type_sql_filter(remediation_type)
    sql_query = f"""
            SELECT
                least({NUM_TREND_PERIODS - 1}, greatest(0, cast(floor(
                    (unix_timestamp(created_at) - (unix_timestamp(current_timestamp()) - {int(range_sec)})) / {bucket_sec}
                ) as int))) AS period_idx,
                count(case when remediation_status NOT IN ('COMPLETED', 'SKIPPED') then 1 else null end) AS failed,
                count(*) AS generated
            FROM {actions} actions
            WHERE created_at >= {interval_sql} {remediation_filters}
            GROUP BY 1
    """

    def run_summary_trend():
        df = run_query(conn, sql_query)
        df.columns = [str(c).lower() for c in df.columns]
        return {
            int(row["period_idx"]): [int(row.get("generated", 0)), int(row.get("failed", 0))]
            for _, row in df.iterrows()
        }

    try:
        data = run_summary_trend()
        prev_generated = 0
        prev_failed = 0
        for period in range(NUM_TREND_PERIODS - 1, -1, -1):
            row = data.get(period, [prev_generated, prev_failed])
            trend.append(
                {
                    "period": (datetime.now() - timedelta(seconds=period * bucket_sec)).strftime(
                        "%Y-%m-%d %H:%M"
                    ),
                    "generated": row[0],
                    "failed": row[1],
                    "completed": row[0] - row[1],
                }
            )
            prev_generated = row[0]
            prev_failed = row[1]
    except Exception as e:
        raise HTTPException(502, str(e))
    return SummaryTrendResponse(trend=trend)
