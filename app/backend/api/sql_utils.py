"""Shared SQL string helpers and JSON-safe row conversion for API routes."""
import math
from typing import Any, Optional

NUM_TREND_PERIODS = 5


def esc(s) -> str:
    if s is None or (isinstance(s, float) and str(s) == "nan"):
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def remediation_type_sql_filter(remediation_type: str, actions_alias: str = "actions") -> str:
    """SQL AND clause for MANUAL (report/alert) vs AUTOMATED remediation on control actions."""
    col = f"upper({actions_alias}.action_type)"
    if remediation_type == "MANUAL":
        return f"and {col} rlike '(REPORT*|ALERT*)'"
    if remediation_type == "AUTOMATED":
        return f"and {col} not rlike '(REPORT*|ALERT*)'"
    return ""


def opt(s) -> str:
    if s is None or (isinstance(s, str) and not str(s).strip()):
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def arr_sql(arr) -> str:
    if not arr:
        return "array()"
    return "array(" + ", ".join(esc(x) for x in arr) + ")"


def json_safe(val: Any) -> Any:
    """Convert a value to something JSON-serializable (no nan, inf, NaT, numpy, or Arrow)."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    try:
        import pandas as pd

        if pd.isna(val):
            return None
    except Exception:
        pass
    if hasattr(val, "isoformat"):
        return val.isoformat()
    if isinstance(val, (list, tuple)) or (hasattr(val, "__iter__") and not isinstance(val, (str, dict))):
        try:
            return [json_safe(x) for x in val]
        except Exception:
            return list(val)
    if isinstance(val, dict):
        return {str(k): json_safe(v) for k, v in val.items()}
    if hasattr(val, "item"):
        return json_safe(val.item())
    if isinstance(val, (bool, int, str)):
        return val
    if isinstance(val, float):
        return val
    return str(val)


def rows_json_safe(rows: list[dict]) -> list[dict]:
    """Replace nan/inf/NaT in row dicts so FastAPI can serialize to JSON."""
    for r in rows:
        for k in list(r.keys()):
            r[k] = json_safe(r[k])
    return rows


def pct_change_vs_previous(current: int, previous: int) -> Optional[float]:
    """Return (current - previous) / previous * 100, or None when there is no prior baseline."""
    if previous > 0:
        return (current - previous) / previous * 100.0
    if current == 0:
        return 0.0
    return None
