"""Pydantic request/response models for GovernBot API routes."""
from typing import Any, Optional

from pydantic import BaseModel, field_validator, model_validator


class AppConfig(BaseModel):
    catalog: str = ""
    schema_: str = ""
    warehouse_http_path: str = ""

    class Config:
        populate_by_name = True
        fields = {"schema_": "schema"}


class SummaryResponse(BaseModel):
    # Current window [now - hours, now)
    total: int
    pending: int
    completed: int
    # Prior window [now - 2*hours, now - hours); used with pct_change_* vs current
    total_previous: int
    pending_previous: int
    completed_previous: int
    # (current - previous) / previous * 100; null if previous is 0 and current > 0
    pct_change_total: Optional[float] = None
    pct_change_pending: Optional[float] = None
    pct_change_completed: Optional[float] = None
    by_type: list[dict]
    by_object_type: list[dict]
    by_type_previous: list[dict]
    by_object_type_previous: list[dict]
    latest: list[dict]


class TrendPoint(BaseModel):
    period: str
    generated: int
    failed: int
    completed: int


class SummaryTrendResponse(BaseModel):
    trend: list[TrendPoint]


class ActionRow(BaseModel):
    violation_id: str
    workspace_id: Optional[str]
    object_id: Optional[str]
    event_time: Optional[str]
    violation_type: Optional[str]
    object_type: Optional[str]
    object_name: Optional[str]
    user_email: Optional[str]
    violation_reason: Optional[str]
    remediation_action: Optional[str]
    processing_status: Optional[str]
    ca_status: Optional[str]
    retry_count: Optional[int]
    error_message: Optional[str]
    remediation_details: Optional[str]


class ApproveBody(BaseModel):
    note: Optional[str] = ""


class RejectBody(BaseModel):
    reason: str = ""


class NoteBody(BaseModel):
    note: str = ""


class BulkAcknowledgeBody(BaseModel):
    violation_ids: list[str]
    note: Optional[str] = ""


class BulkRejectBody(BaseModel):
    violation_ids: list[str]
    reason: str = ""


class WorkspaceBody(BaseModel):
    workspace_id: str
    workspace_name: str
    workspace_url: str = ""
    warehouse_id: Optional[str] = None
    enforcement_enabled: bool = False
    notification_email: Optional[str] = None
    notification_slack_webhook: Optional[str] = None
    enabled_object_types: list[str] = []
    max_retry_attempts: int = 3
    created_by: str = "api"

    @field_validator("enabled_object_types", mode="before")
    @classmethod
    def _coerce_enabled_object_types(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []

    @field_validator("workspace_id", "workspace_name", "workspace_url", "created_by", mode="after")
    @classmethod
    def _strip_text_fields(cls, v: str) -> str:
        return (v or "").strip()

    @model_validator(mode="after")
    def _workspace_required(self) -> "WorkspaceBody":
        if not self.workspace_url:
            raise ValueError("workspace_url is required")
        if not self.enabled_object_types:
            raise ValueError("enabled_object_types must include at least one object type")
        if self.max_retry_attempts < 0:
            raise ValueError("max_retry_attempts must be >= 0")
        return self


class IdentityBody(BaseModel):
    identity_name: str
    identity_type: str
    display_name: str = ""
    can_manage_resources: bool = False
    can_manage_permissions: bool = False
    approved_actions: list[str] = []
    is_active: bool = True


class FilterBody(BaseModel):
    filter_id: Optional[str] = None
    filter_name: str
    service_name: str = ""
    action_name: str = ""
    object_type: str = ""
    object_id_expr: str = ""
    object_name_expr: str = ""
    violation_type: str = ""
    remediation_action: str = ""
    is_active: bool = True
    description: str = ""

    @field_validator(
        "filter_name",
        "service_name",
        "action_name",
        "object_type",
        "object_id_expr",
        "object_name_expr",
        "violation_type",
        "remediation_action",
        "description",
        mode="after",
    )
    @classmethod
    def _strip_filter_strings(cls, v: str) -> str:
        return (v or "").strip()

    @model_validator(mode="after")
    def _filter_violation_remediation_required(self) -> "FilterBody":
        if not self.violation_type:
            raise ValueError("violation_type is required")
        if not self.remediation_action:
            raise ValueError("remediation_action is required")
        return self
