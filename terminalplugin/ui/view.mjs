const element = (tag, text, attrs = {}) => {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}
const button = (text, action, disabled = false) => {
  const node = element('button', text, { type: 'button' })
  node.disabled = disabled
  node.addEventListener('click', action)
  return node
}
const select = (label, value, choices, onChange, disabled = false) => {
  const field = element('label', undefined, { class: 'ait-field' })
  field.append(element('span', label))
  const input = element('select', undefined, { 'aria-label': label })
  for (const choice of choices) {
    const option = element('option', choice.label, { value: choice.value })
    option.disabled = Boolean(choice.disabled)
    input.append(option)
  }
  input.value = value
  input.disabled = disabled
  input.addEventListener('change', () => onChange(input.value))
  field.append(input)
  return field
}
const policies = [['balanced', 'Balanced'], ['economy', 'Economy'], ['fastest', 'Fastest'], ['maximum-quality', 'Maximum quality']]
const permissions = [['ask', 'Ask'], ['auto-edit', 'Auto-edit'], ['full-access', 'Full access']]
const choices = rows => rows.map(([value, label]) => ({ value, label }))
const routeLabel = route => route ? [route.providerId, route.modelId, ...(route.configValues || []).map(value => value.id + ': ' + value.value)].filter(Boolean).join(' · ') : 'Routing is selected when the host receives the first task prompt.'

export function configOptionsMatchModel(provider, override) {
  const current = (provider.configOptions || []).find(option => option.category === 'model')?.currentValue
  return Boolean(override.modelId && current && override.modelId === current)
}

export function createView(root, actions) {
  const section = element('section', undefined, { class: 'ait', 'aria-label': 'AI Terminal' })
  const header = element('header', undefined, { class: 'ait-header' })
  const heading = element('div'); heading.append(element('h1', 'AI Terminal'), element('p', 'One coding task, one shared session.'))
  const refresh = button('Refresh providers', () => actions().refresh())
  header.append(heading, refresh)
  const alerts = element('div', undefined, { class: 'ait-alerts' })
  const context = element('div', undefined, { class: 'ait-context' })
  const settings = element('details', undefined, { class: 'ait-settings' })
  settings.open = true
  settings.append(element('summary', 'Routing and permissions'))
  const settingsBody = element('div'); settings.append(settingsBody)
  const workUnitBox = element('div', undefined, { class: 'ait-work-unit' })
  const workUnitLabel = element('label', 'Next task work unit (optional)', { for: 'ait-work-unit-' + crypto.randomUUID(), class: 'ait-field' })
  const workUnitInput = element('input', undefined, { id: workUnitLabel.htmlFor, type: 'text', maxlength: '64', placeholder: 'TM-001', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': workUnitLabel.htmlFor + '-hint' })
  workUnitInput.addEventListener('input', () => actions().setWorkUnitID(workUnitInput.value))
  workUnitBox.append(workUnitLabel, workUnitInput, element('p', 'Leave empty for an unlinked task. The host checks this exact task in the selected project checkout. Completing a linked work unit ends its shared session. This applies only to Start task or New task, not follow-ups.', { id: workUnitLabel.htmlFor + '-hint', class: 'ait-muted' }))
  const sessionBar = element('div', undefined, { class: 'ait-session-bar' })
  const preview = element('div', undefined, { class: 'ait-preview' })
  const history = element('ol', undefined, { class: 'ait-history', 'aria-label': 'Session history', tabindex: '0' })
  const compose = element('form', undefined, { class: 'ait-compose' })
  const label = element('label', 'Task or follow-up', { for: 'ait-prompt-' + crypto.randomUUID() })
  const prompt = element('textarea', undefined, { id: label.htmlFor, rows: '4', placeholder: 'Describe the change you want to make…', 'aria-describedby': label.htmlFor + '-hint' })
  const hint = element('p', 'Enter sends a new line. Ctrl+Enter or ⌘+Enter sends. Prompts are limited to 8 MiB; larger prompts use a scoped upload.', { id: label.htmlFor + '-hint', class: 'ait-muted' })
  const controls = element('div', undefined, { class: 'ait-actions' })
  const send = element('button', 'Start task', { type: 'submit', class: 'ait-primary' })
  const previewButton = button('Preview route', () => actions().preview())
  controls.append(send, previewButton)
  compose.append(label, prompt, hint, controls)
  prompt.addEventListener('input', () => actions().setDraft(prompt.value))
  prompt.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!send.disabled) compose.requestSubmit() } })
  compose.addEventListener('submit', event => { event.preventDefault(); void actions().send() })
  const endDialog = element('dialog', undefined, { class: 'ait-confirm', 'aria-label': 'End shared session' })
  endDialog.append(element('h2', 'End this shared session?'), element('p', 'The coding connection ends in Projects and the dock. The transcript remains available.'))
  const endControls = element('div', undefined, { class: 'ait-actions' })
  endControls.append(button('Cancel', () => endDialog.close()), button('End shared session', () => { endDialog.close(); void actions().sessionAction('End') }))
  endDialog.append(endControls)
  section.append(header, alerts, context, settings, workUnitBox, sessionBar, preview, history, compose, endDialog)
  root.append(section)
  let historySignature = ''
  function render(state) {
    refresh.disabled = state.busy || state.loading
    alerts.replaceChildren()
    if (state.error) alerts.append(element('p', state.error + ' No prompt will be retried automatically.', { role: 'alert', class: 'ait-error' }))
    if (state.notice) alerts.append(element('p', state.notice, { role: 'status' }))
    context.replaceChildren()
    if (state.loading) context.append(element('p', 'Loading admitted providers and durable sessions…', { role: 'status' }))
    else if (!state.context.projectId) context.append(element('p', 'Open a project and select AI Terminal to start a task, or open an existing session.'))
    else if (!state.session && !state.context.checkoutRef) context.append(element('p', 'Select a checkout in Projects. New tasks stay disabled until the host supplies its checkout reference.'))
    else context.append(element('p', 'Project: ' + state.context.projectId + ' · Checkout: ' + (state.context.checkoutRef || state.session?.checkoutRef)))
    if (!state.session) context.append(element('p', 'Each new task uses a fresh worktree from committed HEAD. Uncommitted changes are excluded.', { class: 'ait-muted' }))
    if (state.sessions.length) context.append(select('Existing session', state.session?.id || '', [{ value: '', label: 'Choose a session…' }, ...state.sessions.map(session => ({ value: session.id, label: session.taskId + ' · ' + session.state }))], id => { if (id) actions().selectSession(id) }, state.busy))
    renderSettings(state)
    if (workUnitInput.value !== state.nextWorkUnitID) workUnitInput.value = state.nextWorkUnitID
    workUnitInput.disabled = state.busy || state.loading
    sessionBar.replaceChildren()
    const session = state.session
    if (session) {
      const info = element('div'); info.append(element('h2', 'Task ' + session.taskId), element('p', session.state + ' · ' + routeLabel(session.route)))
      if (session.route) info.append(element('p', session.route.source + ': ' + session.route.reason, { class: 'ait-muted' }))
      if (session.worktreeRef) info.append(element('p', 'Task worktree: ' + session.worktreeRef, { class: 'ait-muted' }))
      if (session.workUnit) info.append(element('p', 'Linked Task Management task: ' + session.workUnit.taskId + '. Its authoritative completion ends this shared session.', { class: 'ait-muted' }))
      sessionBar.append(info)
      const bar = element('div', undefined, { class: 'ait-actions' })
      const unavailable = state.busy || state.loading
      bar.append(button('Open in dock', () => actions().sessionAction('OpenSurface'), unavailable || session.state === 'ended'))
      bar.append(button('Stop prompt', () => actions().sessionAction('Stop'), unavailable || !session.activePromptId))
      if (session.recovery !== 'none') {
        sessionBar.append(element('p', 'Recovery: ' + session.recovery + '. Recover never resends an uncertain prompt.', { role: 'status' }))
        bar.append(button('Recover connection', () => actions().sessionAction('Recover'), unavailable || !['loadable', 'resumable'].includes(session.recovery)))
      }
      bar.append(button('Complete task', () => actions().sessionAction('Complete'), unavailable || Boolean(session.activePromptId) || ['ended', 'completed'].includes(session.state)))
      bar.append(button('New task', () => actions().sessionAction('NewTask'), unavailable || Boolean(session.activePromptId) || session.state !== 'completed'))
      bar.append(button('End session', () => endDialog.showModal(), unavailable || session.state === 'ended'))
      sessionBar.append(bar, element('p', 'Completing a task is explicit and checked by the host. Closing the dock ends this shared session; navigating away does not.', { class: 'ait-muted' }))
    }
    preview.replaceChildren()
    if (state.preview) {
      preview.append(element('h2', 'Route preview · ' + state.preview.state))
      const result = state.preview.result
      if (result) {
        preview.append(element('p', routeLabel(result.route)), element('p', result.reason))
        preview.append(element('p', 'Confidence: ' + (result.confidence ?? 'unknown') + ' · Cost: ' + (result.costKnown ? 'known to host' : 'unknown') + ' · Latency: ' + (result.latencyKnown ? 'known to host' : 'unknown'), { class: 'ait-muted' }))
        for (const warning of result.warnings || []) preview.append(element('p', warning))
      }
      if (state.preview.failure) preview.append(element('p', state.preview.failure.message, { role: 'alert' }))
      if (['queued', 'running'].includes(state.preview.state)) preview.append(button('Cancel preview', () => actions().cancelPreview(), state.busy))
      preview.append(element('p', 'Uses the host’s real routing policy. No session, worktree, or agent process is created. Decision-provider usage may be charged.', { class: 'ait-muted' }))
    }
    const signature = JSON.stringify([session?.id, session?.activePromptId, state.busy, state.events, [...state.texts], [...state.textErrors], [...state.resolvedApprovals]])
    if (signature !== historySignature) {
      const follow = history.scrollHeight - history.scrollTop - history.clientHeight < 64
      const previousScroll = history.scrollTop
      history.replaceChildren()
      if (!state.events.length) history.append(element('li', session ? 'Waiting for session events.' : 'Describe a coding task to begin. Your route and agent activity will appear here.', { class: 'ait-empty' }))
      for (const event of state.events) history.append(renderEvent(event, state))
      history.scrollTop = follow ? history.scrollHeight : previousScroll
      historySignature = signature
    }
    if (prompt.value !== state.draft) prompt.value = state.draft
    const canSend = session ? ['pending', 'active'].includes(session.state) && !session.activePromptId && session.recovery === 'none' : Boolean(state.context.projectId && state.context.checkoutRef && state.providers.some(provider => provider.availability === 'available'))
    send.disabled = state.busy || state.loading || !canSend
    send.textContent = state.busy ? 'Working…' : session ? 'Send follow-up' : 'Start task'
    previewButton.disabled = state.busy || state.loading || !(state.context.projectId && (state.context.checkoutRef || session?.checkoutRef)) || Boolean(state.preview && ['queued', 'running'].includes(state.preview.state))
  }
  function renderSettings(state) {
    settingsBody.replaceChildren()
    const prefs = state.preferences
    const override = prefs.nextTaskOverrides || {}
    const update = patch => actions().setPreferences({ ...prefs, ...patch })
    const setOverride = next => update({ nextTaskOverrides: next })
    const provider = state.providers.find(value => value.id === override.providerId)
    const available = state.providers.filter(value => value.availability === 'available')
    const modes = new Set((provider ? [provider] : available).flatMap(value => value.permissionModes || []))
    const grid = element('div', undefined, { class: 'ait-options' })
    grid.append(select('Routing policy', prefs.routingPolicy, choices(policies), routingPolicy => update({ routingPolicy }), state.busy))
    grid.append(select('Permission mode', prefs.permissionMode, choices(permissions).map(value => ({ ...value, disabled: !modes.has(value.value) })), permissionMode => update({ permissionMode }), state.busy || !modes.size))
    grid.append(select('Next task provider', override.providerId || '', [{ value: '', label: 'Automatic' }, ...state.providers.map(value => ({ value: value.id, label: value.name + (value.availability === 'available' ? '' : ' · ' + value.availability), disabled: value.availability !== 'available' }))], providerId => setOverride(providerId ? { providerId } : undefined), state.busy))
    if (provider) {
      grid.append(select('Next task model', override.modelId || '', [{ value: '', label: 'Automatic' }, ...(provider.models || []).map(value => ({ value: value.id, label: value.name }))], modelId => setOverride({ providerId: provider.id, ...(modelId ? { modelId } : {}) }), state.busy))
      if (configOptionsMatchModel(provider, override)) {
        for (const option of provider.configOptions || []) {
          if (option.category === 'model') continue
          if (option.type !== 'select' || !option.choices?.length) {
            settingsBody.append(element('p', option.name + ': ' + option.currentValue + ' (provider-specific; read-only)', { class: 'ait-muted' }))
            continue
          }
          const selected = override.configValues?.find(value => value.id === option.id)?.value || ''
          grid.append(select('Next task ' + option.name, selected, [{ value: '', label: 'Automatic' }, ...option.choices.map(value => ({ value: value.value, label: (value.group ? value.group + ' · ' : '') + value.name }))], value => {
            const configValues = (override.configValues || []).filter(item => item.id !== option.id)
            if (value) configValues.push({ id: option.id, value })
            setOverride({ ...override, ...(configValues.length ? { configValues } : { configValues: undefined }) })
          }, state.busy))
        }
      } else settingsBody.append(element('p', 'Effort overrides need an explicitly selected model with known options. Automatic routing keeps effort automatic; changing model clears its choices until the host negotiates them.', { class: 'ait-muted' }))
    }
    settingsBody.prepend(grid)
    settingsBody.append(element('p', 'Overrides apply to the next task only. Follow-ups keep the current provider, model, and effort. Permission choices are shown only when a provider reports an enforceable mode.', { class: 'ait-muted' }))
    if (prefs.permissionMode !== 'ask') settingsBody.append(element('p', prefs.permissionMode === 'full-access' ? 'Full access permits broader host-approved coding actions. Review the selected provider and project before starting.' : 'Auto-edit permits host-approved file edits. Other actions still follow the host’s policy.', { role: 'note' }))
    if (!available.length) settingsBody.append(element('p', 'No admitted ACP coding provider is available. Refresh after installing or signing into a supported client.', { role: 'status' }))
    for (const value of state.providers.filter(value => value.availability !== 'available')) settingsBody.append(element('p', value.name + ': ' + (value.unavailableReason || value.availability), { class: 'ait-muted' }))
    if (state.session) settingsBody.append(button('Save next-task preferences', () => actions().sessionAction('UpdatePreferences'), state.busy || state.session.state === 'ended'))
  }
  function renderEvent(event, state) {
    const row = element('li', undefined, { class: 'ait-event', 'data-kind': event.kind })
    const meta = element('div', undefined, { class: 'ait-event-meta' })
    meta.append(element('strong', event.message?.role || event.tool?.title || event.kind), element('time', event.at, { datetime: event.at }))
    row.append(meta)
    if (event.message || event.tool?.content) row.append(element('pre', state.texts.get(event.sequence) ?? (state.textErrors.has(event.sequence) ? 'Content temporarily unavailable; retrying on refresh. ' + state.textErrors.get(event.sequence) : 'Loading content…'), { class: 'ait-content' }))
    if (event.tool) row.append(element('p', 'Tool status: ' + event.tool.status))
    if (event.route) row.append(element('p', routeLabel(event.route)), element('p', event.route.reason))
    if (event.state) row.append(element('p', event.state.state + (event.state.recovery !== 'none' ? ' · ' + event.state.recovery : '')))
    if (event.failure) row.append(element('p', event.failure.message, { role: 'alert' }))
    if (event.config) row.append(element('p', 'Configuration updated: ' + (event.config.options || []).map(value => value.name + ' = ' + value.currentValue).join(' · ')))
    if (event.approval) {
      row.append(element('p', event.approval.title))
      const bar = element('div', undefined, { class: 'ait-actions' })
      for (const option of event.approval.options || []) bar.append(button(option.name, () => actions().approve(event.approval.id, option.id), state.busy || state.resolvedApprovals.has(event.approval.id) || state.session?.activePromptId !== event.approval.promptId))
      row.append(bar)
    }
    return row
  }
  return { render, remove: () => section.remove() }
}
