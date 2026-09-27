import { mount } from '/panel.mjs'
const abort = new AbortController()
const listeners = new Map()
const params = new URLSearchParams(location.search)
if (params.has('light')) document.documentElement.setAttribute('data-bd-theme', 'light')
let hostLocation = { params: { projectId: 'fixture-project' }, search: params.has('missing') ? '' : '?checkoutRef=fixture-checkout' }
let current = { id: 'fixture-session', taskId: 'fixture-task', projectId: 'fixture-project', state: 'pending', preferences: { routingPolicy: 'balanced', permissionMode: 'ask' }, configOptions: [], lastSequence: '0', recovery: 'none', createdAt: '2026-09-25T12:00:00Z', updatedAt: '2026-09-25T12:00:00Z', checkoutRef: 'fixture-checkout' }
const events = []
const uploads = new Map()
const stats = { pages: 0, reads: 0, releases: 0 }
const status = document.createElement('p')
document.body.append(status)
function report() { status.textContent = 'Fixture-only counters: catalog pages ' + stats.pages + ', payload reads ' + stats.reads + ', released output leases ' + stats.releases + '.' }
report()
const route = { providerId: 'fixture-client', providerGeneration: 'fixture-generation', modelId: 'fixture-model', configValues: [{ id: 'thought', value: 'fixture-medium' }], policy: 'balanced', source: 'fallback', reason: 'Deterministic fixture: live routing is not represented.' }
const provider = { id: 'fixture-client', generation: 'fixture-generation', name: 'Fixture coding client', availability: 'available', capabilities: { loadSession: true, resumeSession: false, closeSession: false, setConfigOption: true, setModel: true, setMode: false }, models: [{ id: 'fixture-model', name: 'Fixture model' }], configOptions: [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'fixture-model', choices: [{ value: 'fixture-model', name: 'Fixture model' }] }, { id: 'thought', name: 'Effort', category: 'thought_level', type: 'select', currentValue: 'fixture-medium', choices: [{ value: 'fixture-medium', name: 'Fixture medium' }] }], permissionModes: ['ask'], observedAt: '2026-09-25T12:00:00Z' }
function add(kind, body) { events.push({ sessionId: current.id, taskId: current.taskId, sequence: String(events.length + 1), at: '2026-09-25T12:00:00Z', kind, ...body }); current.lastSequence = String(events.length) }
const host = {
  identity: { major: 1, features: ['ui.mount.v1', 'coding.sessions.v1'], pluginId: 'ai-terminal', generation: 'fixture-generation' },
  signal: abort.signal, location: () => hostLocation,
  navigate(path) { const id = path.split('/').at(-1); hostLocation = { params: { sessionId: id }, search: '' }; listeners.get('host.location')?.(hostLocation) },
  subscribe(name, callback) { listeners.set(name, callback); return () => listeners.delete(name) },
  async request(subject, request) {
    const operation = subject.split('.').at(-1)
    if (subject.startsWith('cmd.gateway.payloads.v1.')) {
      if (operation === 'create') {
        const handle = { id: 'coding_p_' + crypto.randomUUID(), providerId: request.providerId, providerGeneration: 'fixture-boot', purpose: request.purpose, size: request.size, sha256: request.sha256, state: 'uploading', expiresAt: '2026-09-25T23:00:00Z' }
        uploads.set(handle.id, { handle, bytes: [] }); return { handle }
      }
      const upload = uploads.get(request.handleId)
      if (!upload) throw new Error('Fixture payload unavailable')
      if (operation === 'append') { const bytes = Uint8Array.from(atob(request.data), x => x.charCodeAt(0)); if (Number(request.offset) !== upload.bytes.length) throw Error('Fixture offset mismatch'); upload.bytes.push(...bytes); return { nextOffset: String(upload.bytes.length) } }
      if (operation === 'commit') { upload.handle = { ...upload.handle, state: 'committed' }; return { handle: upload.handle } }
      if (operation === 'read') { const start = Number(request.offset); const bytes = upload.bytes.slice(start, start + request.limit); stats.reads++; report(); if (params.has('retry') && stats.reads === 1) throw new Error('Fixture temporary read failure'); return { data: btoa(String.fromCharCode(...bytes)), nextOffset: String(start + bytes.length), eof: start + bytes.length === upload.bytes.length } }
      if (operation === 'revoke') { if (upload.handle.purpose === 'provider-response') stats.releases++; report(); uploads.delete(request.handleId); return { revoked: true } }
      throw Error('Unsupported fixture payload operation')
    }
    if (operation === 'catalog') {
      stats.pages++; report()
      if (!params.has('pages')) return { providers: [provider] }
      return request.cursor ? { providers: [{ ...provider, id: 'fixture-client-two', name: 'Fixture client from page two' }] } : { providers: [provider], nextCursor: 'page-two' }
    }
    if (operation === 'list') return { sessions: [] }
    if (operation === 'events') return { events: events.filter(event => BigInt(event.sequence) > BigInt(request.afterSequence)), lastSequence: current.lastSequence, hasMore: false }
    if (operation === 'create') return { session: current }
    if (operation === 'prompt') {
      current = { ...current, state: 'active', route, activePromptId: 'fixture-prompt' }
      const uploaded = request.content.handleId ? uploads.get(request.content.handleId) : undefined
      if (request.content.handleId && !uploaded) throw Error('Fixture prompt missing upload')
      add('message', { message: { role: 'user', content: uploaded ? { inline: 'Fixture received a scoped prompt upload of ' + uploaded.bytes.length + ' bytes.' } : request.content } })
      if (uploaded) uploads.delete(request.content.handleId)
      let output = { inline: 'This fixture demonstrates transcript rendering only. No real coding action ran.' }
      if (params.has('payload')) {
        const text = 'Hydrated fixture output.' + ' '.repeat(34000) + 'No real coding action ran.'
        const id = 'coding_p_output_' + crypto.randomUUID()
        uploads.set(id, { handle: { purpose: 'provider-response' }, bytes: Array.from(new TextEncoder().encode(text)) })
        output = { handleId: id }
      }
      add('message', { message: { role: 'assistant', content: output } })
      add('approval', { approval: { id: 'fixture-approval', promptId: 'fixture-prompt', title: 'Fixture request: edit one test file?', options: [{ id: 'allow', name: 'Allow once', kind: 'allow_once' }, { id: 'deny', name: 'Reject', kind: 'reject_once' }] } })
      return { session: current, promptId: 'fixture-prompt' }
    }
    if (operation === 'approve' || operation === 'stop') { current = { ...current, activePromptId: undefined }; add('state', { state: { state: current.state, recovery: 'none' } }) }
    if (operation === 'complete') current = { ...current, state: 'completed' }
    if (operation === 'end') current = { ...current, state: 'ended' }
    if (operation === 'new-task') current = { ...current, taskId: 'fixture-next-task', state: 'pending', route: undefined }
    if (operation === 'open-surface') return { sessionId: current.id, surfaceId: 'fixture-dock', focused: true }
    if (operation === 'preview' || operation === 'preview-read') return { job: { id: 'fixture-preview', state: 'completed', deadlineAt: '2026-09-25T12:00:10Z', result: { status: 'selected', route, reason: 'Fixture result; not the live host router.', confidence: '0.5', costKnown: false, latencyKnown: false, warnings: ['No live provider inference ran.'] } } }
    return { session: current }
  },
}
mount(document.getElementById('terminal'), host)
