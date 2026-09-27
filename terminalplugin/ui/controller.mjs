import { client, locationContext, assertPrompt, workUnitReference, mergeEvents, changedEvent } from './api.mjs'

const copy = value => structuredClone(value)
const key = () => crypto.randomUUID()
const terminal = new Set(['completed', 'failed', 'cancelled', 'expired'])
export function createController(host, changed, options = {}) {
  const api = client(host)
  let disposed = false
  let epoch = 0
  let refreshing = false
  let timer
  const unsubscribe = []
  const state = {
    context: locationContext(host.location()), providers: [], sessions: [], session: null,
    events: [], texts: new Map(), textErrors: new Map(), preferences: { routingPolicy: 'balanced', permissionMode: 'ask' },
    busy: false, loading: true, error: '', notice: '', preview: null, draft: '', nextWorkUnitID: '', resolvedApprovals: new Set(),
  }
  const emit = () => { if (!disposed) changed(state) }
  const active = stamp => !disposed && !host.signal.aborted && stamp === epoch
  async function keepUnsubmitted(content, stamp) {
    if (active(stamp)) return true
    // No coding command has seen this confirmed upload. Unlike an uncertain
    // Prompt response, releasing it cannot cancel accepted coding work.
    try { await api.releaseText(content) } catch { /* Withdrawal/TTL handles cleanup. */ }
    return false
  }
  let storage = options.storage
  if (!storage) { try { storage = globalThis.localStorage } catch {} }
  function rememberPolicy() {
    try { storage?.setItem('ai-terminal.policy.' + state.context.projectId, state.preferences.routingPolicy) } catch {}
  }
  function loadPolicy() {
    try {
      const value = storage?.getItem('ai-terminal.policy.' + state.context.projectId)
      if (['balanced', 'economy', 'fastest', 'maximum-quality'].includes(value)) state.preferences.routingPolicy = value
    } catch {}
  }
  async function run(operation) {
    if (disposed || state.busy) return
    const stamp = epoch
    state.busy = true; state.error = ''; state.notice = ''; emit()
    try { await operation(stamp) } catch (error) {
      if (active(stamp)) state.error = error.message || 'The operation failed.'
    } finally { if (active(stamp)) { state.busy = false; emit() } }
  }
  async function collect(operation, initial, field, stamp) {
    const rows = []
    let cursor
    const seen = new Set()
    do {
      const result = await api.call(operation, { ...initial, ...(cursor ? { cursor } : {}) })
      if (!active(stamp)) return []
      rows.push(...(result[field] || []))
      cursor = result.nextCursor
      if (cursor && seen.has(cursor)) throw new Error('The host returned a repeated page cursor.')
      if (cursor) seen.add(cursor)
      if (rows.length > 10000) throw new Error('The host catalog is too large for this view.')
    } while (cursor)
    return rows
  }
  async function refresh() {
    if (disposed || refreshing) return
    const stamp = epoch
    refreshing = true
    try {
      if (state.session) {
        const id = state.session.id
        const result = await api.call('Read', { sessionId: id })
        if (!active(stamp) || state.session?.id !== id) return
        state.session = result.session
        let more = true
        let pages = 0
        while (more && pages++ < 20) {
          const failed = [...state.textErrors.keys()].map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
          const afterSequence = failed.length ? String(failed[0] - 1n) : state.events.at(-1)?.sequence || '0'
          const page = await api.call('Events', { sessionId: id, afterSequence, limit: 50 })
          if (!active(stamp) || state.session?.id !== id) return
          const next = mergeEvents(state.events, page.events, id)
          if (page.hasMore && !failed.length && next.length === state.events.length) throw new Error('Session history did not advance.')
          state.events = next
          more = page.hasMore
          for (const event of page.events || []) {
            const content = event.message?.content || event.tool?.content
            if (content && !state.texts.has(event.sequence)) {
              try {
                const text = await api.readText(content)
                if (!active(stamp)) return
                state.texts.set(event.sequence, text)
                state.textErrors.delete(event.sequence)
              } catch (error) {
                if (!active(stamp)) return
                state.textErrors.set(event.sequence, error.message)
              }
            } else if (content?.handleId) {
              // Replayed Events mint a fresh viewer lease, even when this view
              // already has the bytes. It owns and may release that unused lease.
              try { await api.releaseText(content) } catch { /* TTL remains bounded. */ }
            }
          }
          // A later poll requests a reminted viewer handle. Never spin through
          // the same failed page or mark a partial fetch as permanently hydrated.
          if (state.textErrors.size) break
        }
      }
      if (state.preview && !terminal.has(state.preview.state)) {
        const result = await api.call('PreviewRead', { jobId: state.preview.id })
        if (!active(stamp)) return
        state.preview = result.job
      }
    } catch (error) { if (active(stamp)) state.error = error.message } finally {
      refreshing = false
      if (active(stamp)) emit()
    }
  }
  async function load(location) {
    const context = locationContext(location)
    if (state.session && !context.sessionId && context.projectId === state.context.projectId && context.checkoutRef === state.context.checkoutRef) return
    epoch++
    const stamp = epoch
    state.context = context; state.session = null; state.events = []; state.texts.clear(); state.textErrors.clear()
    state.busy = false; state.loading = true; state.error = ''; state.preview = null
    state.nextWorkUnitID = ''
    state.preferences = { routingPolicy: 'balanced', permissionMode: 'ask' }
    loadPolicy(); emit()
    try {
      const providers = await collect('Catalog', {}, 'providers', stamp)
      if (!active(stamp)) return
      state.providers = providers
      if (context.sessionId) {
        const result = await api.call('Read', { sessionId: context.sessionId })
        if (!active(stamp)) return
        state.session = result.session
        state.preferences = copy(result.session.preferences)
        if (!state.context.projectId) state.context.projectId = result.session.projectId
      }
      if (state.context.projectId) {
        const sessions = await collect('List', { projectId: state.context.projectId }, 'sessions', stamp)
        if (active(stamp)) state.sessions = sessions
      }
    } catch (error) { if (active(stamp)) state.error = error.message } finally {
      if (active(stamp)) { state.loading = false; emit(); void refresh() }
    }
  }
  const actions = {
    setDraft(value) { state.draft = value },
    setWorkUnitID(value) { state.nextWorkUnitID = value },
    setPreferences(value) { state.preferences = copy(value); rememberPolicy(); emit() },
    refresh: () => run(async stamp => {
      const providers = await collect('Catalog', {}, 'providers', stamp)
      if (!active(stamp)) return
      state.providers = providers
      await refresh()
    }),
    selectSession(id) { host.navigate('/ai-terminal/sessions/' + encodeURIComponent(id)) },
    send: () => run(async stamp => {
      assertPrompt(state.draft)
      const draft = state.draft
      const consumesOverrides = !state.session || state.session.state === 'pending'
      if (!state.session) {
        if (!state.context.projectId || !state.context.checkoutRef) throw new Error('Choose a checkout in Projects before starting a task.')
        const workUnit = workUnitReference(state.nextWorkUnitID)
        const created = await api.call('Create', { projectId: state.context.projectId, checkoutRef: state.context.checkoutRef, preferences: copy(state.preferences), idempotencyKey: key(), ...(workUnit ? { workUnit } : {}) })
        if (!active(stamp)) return
        state.session = created.session
        state.nextWorkUnitID = ''
        state.notice = 'Session created. Sending the first prompt.'
        emit()
      }
      const content = await api.uploadText(draft)
      if (!await keepUnsubmitted(content, stamp)) return
      const result = await api.call('Prompt', { sessionId: state.session.id, content, idempotencyKey: key() })
      if (!active(stamp)) return
      state.session = result.session; state.draft = ''
      // The host has accepted this task's overrides. Do not send them again
      // when the operator later starts another task.
      if (consumesOverrides) state.preferences = { routingPolicy: state.preferences.routingPolicy, permissionMode: state.preferences.permissionMode }
      // No automatic retry: a lost response may follow an accepted ACP prompt.
      state.notice = 'Prompt accepted. Follow-ups stay with this task’s route.'
      await refresh()
    }),
    sessionAction: operation => run(async stamp => {
      if (!state.session) return
      const request = { sessionId: state.session.id }
      if (operation === 'Stop') request.promptId = state.session.activePromptId
      if (operation === 'NewTask') {
        const workUnit = workUnitReference(state.nextWorkUnitID)
        Object.assign(request, { preferences: copy(state.preferences), idempotencyKey: key(), ...(workUnit ? { workUnit } : {}) })
      }
      if (operation === 'UpdatePreferences') request.preferences = copy(state.preferences)
      const allowed = ['Stop', 'End', 'Complete', 'NewTask', 'Recover', 'UpdatePreferences', 'OpenSurface']
      if (!allowed.includes(operation)) throw new Error('Unknown session action.')
      const result = await api.call(operation, request)
      if (!active(stamp)) return
      if (result.session) state.session = result.session
      if (operation === 'NewTask') {
        state.preferences = { routingPolicy: state.preferences.routingPolicy, permissionMode: state.preferences.permissionMode }
        state.nextWorkUnitID = ''
      }
      state.notice = operation === 'OpenSurface' ? (result.focused ? 'The shared session is selected in the dock. Closing that dock ends this session.' : 'The shared dock is available. Open Projects to select it; closing that dock ends this session.') : 'Host accepted the action.'
      await refresh()
    }),
    approve: (approvalId, optionId) => run(async stamp => {
      const result = await api.call('Approve', { sessionId: state.session.id, approvalId, optionId })
      if (!active(stamp)) return
      state.session = result.session
      state.resolvedApprovals.add(approvalId)
      state.notice = 'Approval recorded by the host.'
      await refresh()
    }),
    preview: () => run(async stamp => {
      assertPrompt(state.draft)
      const projectId = state.context.projectId
      const checkoutRef = state.context.checkoutRef || state.session?.checkoutRef
      if (!projectId || !checkoutRef) throw new Error('Choose a checkout in Projects before previewing.')
      const content = await api.uploadText(state.draft)
      if (!await keepUnsubmitted(content, stamp)) return
      const result = await api.call('Preview', { projectId, checkoutRef, preferences: copy(state.preferences), content, idempotencyKey: key() })
      if (active(stamp)) state.preview = result.job
    }),
    cancelPreview: () => run(async stamp => {
      const result = await api.call('PreviewCancel', { jobId: state.preview.id })
      if (active(stamp)) state.preview = result.job
    }),
  }
  function dispose() {
    if (disposed) return
    disposed = true; epoch++; clearInterval(timer)
    for (const off of unsubscribe) off()
    host.signal.removeEventListener('abort', dispose)
    // Detaching a view NEVER sends End, Stop, Complete, or replays a prompt.
  }
  try {
    if (!host.signal.aborted) {
      unsubscribe.push(host.subscribe('host.location', location => void load(location)))
      unsubscribe.push(host.subscribe(changedEvent, event => { if (event?.sessionId === state.session?.id) void refresh() }))
      host.signal.addEventListener('abort', dispose, { once: true })
      timer = setInterval(() => void refresh(), options.pollInterval || 1500)
      void load(host.location())
    }
  } catch (error) { dispose(); throw error }
  return { state, actions, dispose }
}
