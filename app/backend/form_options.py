"""
UI/API form enums for the FastAPI app only (not imported from governbot_core).

Keep in sync with:
- governbot_core.constants VIOLATION_TYPES / DISCOVERY_OBJECT_TYPES / APPROVED_ACTION_GROUPS
- notebooks/02_one_time_discover.py `all_objects`
- distinct remediation_action values (raw tuple index 6) in governbot_core.governance_filter_definitions
"""

# Violation types (must match governance_filters.violation_type)
VIOLATION_TYPES = [
    "UNAPPROVED_CREATION",
    "UNAUTHORIZED_PERMISSION_CHANGE",
    "UNAUTHORIZED_DELETION",
    "UNAUTHORIZED_ENTITLEMENT_CHANGE",
    "UNAUTHORIZED_OBJECT_CHANGE",
]

# Discovery object types (same comma list as notebooks/02_one_time_discover.py `all_objects`)
_DISCOVERY_OBJECT_TYPES_CSV = (
    "workspace_objects,query,dashboard,jobs,cluster,pipelines,apps,mlflowExperiments,"
    "monitors,alerts,alertsv2,warehouses,clusterPolicies,instancePools,servingEndpoints,"
    "registeredModels,secretScopes,vectorSearchEndpoints,catalogs,schemas,tables,volumes,"
    "functions,connections,externalLocations,storageCredentials,shares,recipients,providers,"
    "cleanRooms,metastores,genieSpaces,ucRegisteredModels,featureTables,groups,tokensAcls,"
    "users,servicePrincipals,anyFiles"
)
DISCOVERY_OBJECT_TYPES = [x.strip() for x in _DISCOVERY_OBJECT_TYPES_CSV.split(",") if x.strip()]

# Remediation actions (distinct values used in governance_filter_definitions raw filter rows)
REMEDIATION_ACTIONS = [
    "ALERT_ENTITLEMENT_CHANGE",
    "DELETE_RESOURCE",
    "REPORT_DELETION",
    "REPORT_OBJECT_UPDATE",
    "REPORT_SECURITY_TEAM",
    "REVERT_ENTITLEMENT_CHANGE",
    "REVERT_PERMISSION",
    "SKIP_REMEDIATION",
]

# Group alias expansions for approved_actions (same keys/values as governbot_core.constants.APPROVED_ACTION_GROUPS)
APPROVED_ACTION_GROUPS = {
    "ALL": ["ALL"],
    "UC_DATA_OBJECTS": ["catalog", "schema", "table", "volume", "function", "tableConstraint"],
    "UC_SECURITY": ["storageCredential", "externalLocation", "connection"],
    "UC_ALL": [
        "catalog",
        "schema",
        "table",
        "volume",
        "function",
        "connection",
        "externalLocation",
        "storageCredential",
        "ucRegisteredModel",
        "ucModelVersion",
        "abacPolicy",
        "recipient",
        "share",
        "provider",
        "tableConstraint",
    ],
    "COMPUTE": ["cluster", "clusterPolicy", "instancePool", "warehouse"],
    "ML_AI": [
        "mlflowExperiments",
        "servingEndpoint",
        "registeredModel",
        "featureSpec",
        "featureTable",
        "ucRegisteredModel",
        "ucModelVersion",
    ],
    "DATA_SHARING": ["share", "recipient", "provider"],
    "DASHBOARDS_BI": ["dashboard", "genieSpace", "alert", "query"],
    "ORCHESTRATION": ["jobs", "pipelines"],
    "SECRETS": ["secretScope"],
    "VECTOR_SEARCH": ["vectorSearchEndpoint", "vectorIndex"],
    "APPS": ["apps"],
    "MONITORING": ["monitors"],
    "CLEAN_ROOMS": ["cleanRoom"],
}
