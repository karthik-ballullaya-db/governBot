import { useState, useEffect } from 'react'
import {
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  createIdentity,
  updateIdentity,
  deleteIdentity,
  createFilter,
  updateFilter,
  deleteFilter,
  getConfigFormOptionsCached,
  type ConfigFormOptions,
} from '../api'
import { FormModal } from '../components/FormModal'
import { ObjectTypesMultiSelect } from '../components/ObjectTypesMultiSelect'
import {
  arrFrom,
  resolveApprovedActionGroupKey,
  type WorkspaceRow,
  type IdentityRow,
  type FilterRow,
} from './configsFormUtils'
import './Configs.css'

function optionListWithCurrent(choices: string[], current: string): string[] {
  const c = (current || '').trim()
  if (!c) return choices
  if (choices.includes(c)) return choices
  return [c, ...choices]
}

export function WorkspaceDialog({
  mode,
  row,
  onClose,
  onSaved,
  onError,
}: {
  mode: 'add' | 'edit'
  row?: WorkspaceRow
  onClose: () => void
  onSaved: () => void
  onError: (s: string | null) => void
}) {
  const [workspace_id, setWorkspaceId] = useState('')
  const [workspace_name, setWorkspaceName] = useState('')
  const [workspace_url, setWorkspaceUrl] = useState('')
  const [warehouse_id, setWarehouseId] = useState('')
  const [enforcement_enabled, setEnforcementEnabled] = useState(false)
  const [notification_email, setNotificationEmail] = useState('')
  const [notification_slack_webhook, setNotificationSlackWebhook] = useState('')
  const [enabledObjectTypes, setEnabledObjectTypes] = useState<string[]>([])
  const [max_retry_attempts, setMaxRetryAttempts] = useState(3)
  const [created_by, setCreatedBy] = useState('api')
  const [formOptions, setFormOptions] = useState<ConfigFormOptions | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getConfigFormOptionsCached()
      .then(setFormOptions)
      .catch((e: Error) => onError(e.message))
  }, [onError])

  useEffect(() => {
    if (row) {
      setWorkspaceId(String(row.workspace_id ?? ''))
      setWorkspaceName(String(row.workspace_name ?? ''))
      setWorkspaceUrl(String(row.workspace_url ?? ''))
      setWarehouseId(String(row.warehouse_id ?? ''))
      setEnforcementEnabled(Boolean(row.enforcement_enabled))
      setNotificationEmail(String(row.notification_email ?? ''))
      setNotificationSlackWebhook(String(row.notification_slack_webhook ?? ''))
      setEnabledObjectTypes(arrFrom(row.enabled_object_types))
      const n = Number(row.max_retry_attempts)
      setMaxRetryAttempts(Number.isFinite(n) ? n : 3)
      setCreatedBy(String(row.created_by ?? 'api'))
    } else {
      setWorkspaceId('')
      setWorkspaceName('')
      setWorkspaceUrl('')
      setWarehouseId('')
      setEnforcementEnabled(false)
      setNotificationEmail('')
      setNotificationSlackWebhook('')
      setEnabledObjectTypes([])
      setMaxRetryAttempts(3)
      setCreatedBy('api')
    }
  }, [row])

  const handleSubmit = () => {
    const body = {
      workspace_id,
      workspace_name,
      workspace_url,
      warehouse_id: warehouse_id || null,
      enforcement_enabled,
      notification_email: notification_email || null,
      notification_slack_webhook: notification_slack_webhook || null,
      enabled_object_types: enabledObjectTypes,
      max_retry_attempts,
      created_by,
    }
    setSaving(true)
    onError(null)
    const p = mode === 'add' ? createWorkspace(body) : updateWorkspace(workspace_id, body)
    p.then(onSaved).catch((e) => onError(e.message)).finally(() => setSaving(false))
  }

  const handleDelete = () => {
    if (mode !== 'edit' || !workspace_id.trim()) return
    if (!window.confirm('Delete this workspace entry?')) return
    setDeleting(true)
    onError(null)
    deleteWorkspace(workspace_id)
      .then(onSaved)
      .catch((e) => onError(e.message))
      .finally(() => setDeleting(false))
  }

  return (
    <FormModal
      open
      title={mode === 'add' ? 'Add Workspace' : 'Edit Workspace'}
      titleId="ws-dialog-title"
      onClose={onClose}
      deleteAction={mode === 'edit' ? { onClick: handleDelete, disabled: saving, loading: deleting } : null}
      onCancel={onClose}
      onPrimary={handleSubmit}
      primaryLabel={mode === 'edit' ? 'Save edits' : 'Save'}
      primaryDisabled={
        !workspace_id.trim() ||
        !workspace_name.trim() ||
        !workspace_url.trim() ||
        enabledObjectTypes.length === 0 ||
        !Number.isFinite(max_retry_attempts) ||
        max_retry_attempts < 0
      }
      primaryLoading={saving}
    >
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="ws-id">
          WORKSPACE ID *
        </label>
        <input
          id="ws-id"
          className="configs__formInput"
          value={workspace_id}
          onChange={(e) => setWorkspaceId(e.target.value)}
          placeholder="e.g. ws-123"
          disabled={mode === 'edit'}
        />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="ws-name">
          WORKSPACE NAME *
        </label>
        <input id="ws-name" className="configs__formInput" value={workspace_name} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="My workspace" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="ws-url">
          WORKSPACE URL *
        </label>
        <input id="ws-url" className="configs__formInput" value={workspace_url} onChange={(e) => setWorkspaceUrl(e.target.value)} placeholder="https://..." required />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="ws-wh">
          WAREHOUSE ID
        </label>
        <input id="ws-wh" className="configs__formInput" value={warehouse_id} onChange={(e) => setWarehouseId(e.target.value)} placeholder="optional" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel configs__formLabel--inline" htmlFor="ws-enf">
          <input id="ws-enf" type="checkbox" className="configs__formCheckbox" checked={enforcement_enabled} onChange={(e) => setEnforcementEnabled(e.target.checked)} />
          ENFORCEMENT ENABLED
        </label>
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="ws-email">
          NOTIFICATION EMAIL
        </label>
        <input id="ws-email" type="email" className="configs__formInput" value={notification_email} onChange={(e) => setNotificationEmail(e.target.value)} placeholder="optional" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="ws-slack">
          NOTIFICATION SLACK WEBHOOK
        </label>
        <input id="ws-slack" className="configs__formInput" value={notification_slack_webhook} onChange={(e) => setNotificationSlackWebhook(e.target.value)} placeholder="optional" />
      </div>
      <ObjectTypesMultiSelect
        id="ws-types"
        label="ENABLED OBJECT TYPES"
        options={formOptions?.workspace_object_types ?? []}
        value={enabledObjectTypes}
        onChange={setEnabledObjectTypes}
        disabled={saving || !formOptions}
        required
      />
      {!formOptions ? <p className="configs__formHint">Loading object type list…</p> : null}
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="ws-retries">
          MAX RETRY ATTEMPTS *
        </label>
        <input
          id="ws-retries"
          type="number"
          min={0}
          step={1}
          className="configs__formInput"
          value={Number.isFinite(max_retry_attempts) ? max_retry_attempts : ''}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') {
              setMaxRetryAttempts(Number.NaN)
              return
            }
            setMaxRetryAttempts(Number.parseInt(v, 10))
          }}
          required
        />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="ws-created">
          CREATED BY
        </label>
        <input id="ws-created" className="configs__formInput" value={created_by} onChange={(e) => setCreatedBy(e.target.value)} />
      </div>
    </FormModal>
  )
}

export function IdentityDialog({
  mode,
  row,
  onClose,
  onSaved,
  onError,
}: {
  mode: 'add' | 'edit'
  row?: IdentityRow
  onClose: () => void
  onSaved: () => void
  onError: (s: string | null) => void
}) {
  const [identity_name, setIdentityName] = useState('')
  const [identity_type, setIdentityType] = useState('USER')
  const [display_name, setDisplayName] = useState('')
  const [can_manage_resources, setCanManageResources] = useState(false)
  const [can_manage_permissions, setCanManagePermissions] = useState(false)
  const [approvedActionGroupKey, setApprovedActionGroupKey] = useState('')
  const [is_active, setIsActive] = useState(true)
  const [formOptions, setFormOptions] = useState<ConfigFormOptions | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getConfigFormOptionsCached()
      .then(setFormOptions)
      .catch((e: Error) => onError(e.message))
  }, [onError])

  useEffect(() => {
    if (row) {
      setIdentityName(String(row.identity_name ?? ''))
      setIdentityType(String(row.identity_type ?? 'USER'))
      setDisplayName(String(row.display_name ?? ''))
      setCanManageResources(Boolean(row.can_manage_resources))
      setCanManagePermissions(Boolean(row.can_manage_permissions))
      setIsActive(Boolean(row.is_active))
    } else {
      setIdentityName('')
      setIdentityType('USER')
      setDisplayName('')
      setCanManageResources(false)
      setCanManagePermissions(false)
      setIsActive(true)
    }
  }, [row])

  useEffect(() => {
    const groups = formOptions?.approved_action_groups
    if (!groups || Object.keys(groups).length === 0) return
    if (!row) {
      setApprovedActionGroupKey('ALL')
      return
    }
    const resolved = resolveApprovedActionGroupKey(arrFrom(row.approved_actions), groups)
    setApprovedActionGroupKey(resolved ?? '')
  }, [row, formOptions])

  const handleSubmit = () => {
    const body = {
      identity_name,
      identity_type,
      display_name,
      can_manage_resources,
      can_manage_permissions,
      approved_actions: [approvedActionGroupKey],
      is_active,
    }
    setSaving(true)
    onError(null)
    const p = mode === 'add' ? createIdentity(body) : updateIdentity(identity_name, identity_type, body)
    p.then(onSaved).catch((e) => onError(e.message)).finally(() => setSaving(false))
  }

  const handleDelete = () => {
    if (mode !== 'edit' || !identity_name.trim()) return
    if (!window.confirm('Delete this approved identity?')) return
    setDeleting(true)
    onError(null)
    deleteIdentity(identity_name, identity_type)
      .then(onSaved)
      .catch((e) => onError(e.message))
      .finally(() => setDeleting(false))
  }

  return (
    <FormModal
      open
      title={mode === 'add' ? 'Authorize Identity' : 'Edit Identity'}
      titleId="id-dialog-title"
      onClose={onClose}
      deleteAction={mode === 'edit' ? { onClick: handleDelete, disabled: saving, loading: deleting } : null}
      onCancel={onClose}
      onPrimary={handleSubmit}
      primaryLabel={mode === 'edit' ? 'Save edits' : 'Save'}
      primaryDisabled={!identity_name.trim() || !approvedActionGroupKey.trim()}
      primaryLoading={saving}
    >
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="id-name">
          IDENTITY NAME *
        </label>
        <input id="id-name" className="configs__formInput" value={identity_name} onChange={(e) => setIdentityName(e.target.value)} placeholder="user@example.com" disabled={mode === 'edit'} />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="id-type">
          IDENTITY TYPE *
        </label>
        <select id="id-type" className="configs__formInput" value={identity_type} onChange={(e) => setIdentityType(e.target.value)} disabled={mode === 'edit'}>
          <option value="USER">USER</option>
          <option value="GROUP">GROUP</option>
          <option value="SERVICE_PRINCIPAL">SERVICE_PRINCIPAL</option>
        </select>
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="id-display">
          DISPLAY NAME
        </label>
        <input id="id-display" className="configs__formInput" value={display_name} onChange={(e) => setDisplayName(e.target.value)} placeholder="optional" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel configs__formLabel--inline" htmlFor="id-res">
          <input id="id-res" type="checkbox" className="configs__formCheckbox" checked={can_manage_resources} onChange={(e) => setCanManageResources(e.target.checked)} />
          CAN MANAGE RESOURCES
        </label>
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel configs__formLabel--inline" htmlFor="id-perm">
          <input id="id-perm" type="checkbox" className="configs__formCheckbox" checked={can_manage_permissions} onChange={(e) => setCanManagePermissions(e.target.checked)} />
          CAN MANAGE PERMISSIONS
        </label>
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="id-actions">
          APPROVED ACTION GROUP *
        </label>
        <select
          id="id-actions"
          className="configs__formInput configs__formSelect"
          value={approvedActionGroupKey}
          onChange={(e) => setApprovedActionGroupKey(e.target.value)}
          disabled={saving || !formOptions}
          required
        >
          <option value="" disabled>
            — Select approved action group —
          </option>
          {Object.keys(formOptions?.approved_action_groups ?? {})
            .sort((a, b) => a.localeCompare(b))
            .map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
        </select>
      </div>
      {!formOptions ? <p className="configs__formHint">Loading approved action groups…</p> : null}
      {formOptions && row && !approvedActionGroupKey ? (
        <p className="configs__formHint">
          Stored approved_actions did not match a known group. Choose a group to save (this replaces the previous value).
        </p>
      ) : null}
      <div className="configs__formRow">
        <label className="configs__formLabel configs__formLabel--inline" htmlFor="id-active">
          <input id="id-active" type="checkbox" className="configs__formCheckbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} />
          IS ACTIVE
        </label>
      </div>
    </FormModal>
  )
}

export function FilterDialog({
  mode,
  row,
  onClose,
  onSaved,
  onError,
}: {
  mode: 'add' | 'edit'
  row?: FilterRow
  onClose: () => void
  onSaved: () => void
  onError: (s: string | null) => void
}) {
  const [filter_name, setFilterName] = useState('')
  const [service_name, setServiceName] = useState('')
  const [action_name, setActionName] = useState('')
  const [object_type, setObjectType] = useState('')
  const [object_id_expr, setObjectIdExpr] = useState('')
  const [object_name_expr, setObjectNameExpr] = useState('')
  const [violation_type, setViolationType] = useState('')
  const [remediation_action, setRemediationAction] = useState('')
  const [is_active, setIsActive] = useState(true)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formOptions, setFormOptions] = useState<ConfigFormOptions | null>(null)
  const editFilterId = row ? String(row.filter_id ?? '') : ''

  useEffect(() => {
    getConfigFormOptionsCached()
      .then(setFormOptions)
      .catch((e: Error) => onError(e.message))
  }, [onError])

  useEffect(() => {
    if (row) {
      setFilterName(String(row.filter_name ?? ''))
      setServiceName(String(row.service_name ?? ''))
      setActionName(String(row.action_name ?? ''))
      setObjectType(String(row.object_type ?? ''))
      setObjectIdExpr(String(row.object_id_expr ?? ''))
      setObjectNameExpr(String(row.object_name_expr ?? ''))
      setViolationType(String(row.violation_type ?? ''))
      setRemediationAction(String(row.remediation_action ?? ''))
      setIsActive(Boolean(row.is_active))
      setDescription(String(row.description ?? ''))
    } else {
      setFilterName('')
      setServiceName('')
      setActionName('')
      setObjectType('')
      setObjectIdExpr('')
      setObjectNameExpr('')
      setViolationType('')
      setRemediationAction('')
      setIsActive(true)
      setDescription('')
    }
  }, [row])

  const handleSubmit = () => {
    const body = {
      filter_name,
      service_name,
      action_name,
      object_type,
      object_id_expr,
      object_name_expr,
      violation_type,
      remediation_action,
      is_active,
      description,
    }
    setSaving(true)
    onError(null)
    const p = mode === 'add' ? createFilter(body) : updateFilter(editFilterId, body)
    p.then(onSaved).catch((e) => onError(e.message)).finally(() => setSaving(false))
  }

  const handleDelete = () => {
    if (mode !== 'edit' || !editFilterId) return
    if (!window.confirm('Delete this filter entry?')) return
    setDeleting(true)
    onError(null)
    deleteFilter(editFilterId)
      .then(onSaved)
      .catch((e) => onError(e.message))
      .finally(() => setDeleting(false))
  }

  return (
    <FormModal
      open
      title={mode === 'add' ? 'Add Filter' : 'Edit Filter'}
      titleId="fl-dialog-title"
      onClose={onClose}
      deleteAction={mode === 'edit' ? { onClick: handleDelete, disabled: saving, loading: deleting } : null}
      onCancel={onClose}
      onPrimary={handleSubmit}
      primaryLabel={mode === 'edit' ? 'Save edits' : 'Save'}
      primaryDisabled={!filter_name.trim() || !violation_type.trim() || !remediation_action.trim()}
      primaryLoading={saving}
    >
      {mode === 'edit' ? (
        <div className="configs__formRow">
          <label className="configs__formLabel" htmlFor="fl-fid">
            FILTER ID (READ-ONLY)
          </label>
          <input id="fl-fid" className="configs__formInput configs__formInput--readonly" value={editFilterId} readOnly />
        </div>
      ) : null}
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-name">
          FILTER NAME *
        </label>
        <input id="fl-name" className="configs__formInput" value={filter_name} onChange={(e) => setFilterName(e.target.value)} placeholder="e.g. notebooks_create" disabled={mode === 'edit'} />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-svc">
          SERVICE NAME
        </label>
        <input id="fl-svc" className="configs__formInput" value={service_name} onChange={(e) => setServiceName(e.target.value)} placeholder="e.g. notebooks" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-act">
          ACTION NAME
        </label>
        <input id="fl-act" className="configs__formInput" value={action_name} onChange={(e) => setActionName(e.target.value)} placeholder="e.g. create" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-ot">
          OBJECT TYPE
        </label>
        <input id="fl-ot" className="configs__formInput" value={object_type} onChange={(e) => setObjectType(e.target.value)} placeholder="e.g. notebook" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-oid">
          OBJECT ID EXPR
        </label>
        <input id="fl-oid" className="configs__formInput" value={object_id_expr} onChange={(e) => setObjectIdExpr(e.target.value)} placeholder="optional regex/expr" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-oname">
          OBJECT NAME EXPR
        </label>
        <input id="fl-oname" className="configs__formInput" value={object_name_expr} onChange={(e) => setObjectNameExpr(e.target.value)} placeholder="optional" />
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-viol">
          VIOLATION TYPE *
        </label>
        <select
          id="fl-viol"
          className="configs__formInput configs__formSelect"
          value={violation_type}
          onChange={(e) => setViolationType(e.target.value)}
          disabled={saving || !formOptions}
          required
        >
          <option value="" disabled>
            — Select violation type —
          </option>
          {optionListWithCurrent(formOptions?.violation_types ?? [], violation_type).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-rem">
          REMEDIATION ACTION *
        </label>
        <select
          id="fl-rem"
          className="configs__formInput configs__formSelect"
          value={remediation_action}
          onChange={(e) => setRemediationAction(e.target.value)}
          disabled={saving || !formOptions}
          required
        >
          <option value="" disabled>
            — Select remediation action —
          </option>
          {optionListWithCurrent(formOptions?.remediation_actions ?? [], remediation_action).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {!formOptions ? <p className="configs__formHint">Loading violation and remediation lists…</p> : null}
      <div className="configs__formRow">
        <label className="configs__formLabel configs__formLabel--inline" htmlFor="fl-active">
          <input id="fl-active" type="checkbox" className="configs__formCheckbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} />
          IS ACTIVE
        </label>
      </div>
      <div className="configs__formRow">
        <label className="configs__formLabel" htmlFor="fl-desc">
          DESCRIPTION
        </label>
        <textarea id="fl-desc" className="configs__formInput" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="optional" />
      </div>
    </FormModal>
  )
}
