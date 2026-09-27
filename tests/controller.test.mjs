import assert from 'node:assert/strict'
import test from 'node:test'
import { createController } from '../terminalplugin/ui/controller.mjs'
import { assertPrompt, client, locationContext, mergeEvents } from '../terminalplugin/ui/api.mjs'
import { configOptionsMatchModel } from '../terminalplugin/ui/view.mjs'

const tick = () => new Promise(resolve => setTimeout(resolve, 15))
const session = overrides => ({ id: 'session-1', taskId: 'task-1', projectId: 'project-1', state: 'pending', preferences: { routingPolicy: 'balanced', permissionMode: 'ask' }, configOptions: [], lastSequence: '0', recovery: 'none', createdAt: '2026-09-25T12:00:00Z', updatedAt: '2026-09-25T12:00:00Z', checkoutRef: 'checkout-1', ...overrides })
const provider = { id: 'coding-client', generation: 'generation-1', name: 'Coding client', availability: 'available', capabilities: { loadSession: true, resumeSession: false, closeSession: false, setConfigOption: true, setModel: true, setMode: false }, models: [{ id: 'real-model', name: 'Real model' }], configOptions: [], permissionModes: ['ask'], observedAt: '2026-09-25T12:00:00Z' }
function fixture(override = {}) {
  const abort = new AbortController()
  const calls = []; const listeners = new Map()
  let current = session()
  let location = { params: { projectId: 'project-1' }, search: '?checkoutRef=checkout-1' }
  const host = {
    signal: abort.signal, location: () => location, navigate: path => calls.push(['navigate', path]),
    subscribe: (name, callback) => { listeners.set(name, callback); return () => listeners.delete(name) },
    async request(subject, request) {
      const operation = subject.split('.').at(-1); calls.push([operation, request])
      if (override[operation]) return override[operation](request)
      if (operation === 'catalog') return { providers: [provider] }
      if (operation === 'list') return { sessions: [] }
      if (operation === 'events') return { events: [], lastSequence: '0', hasMore: false }
      if (operation === 'prompt') { current = session({ activePromptId: 'prompt-1' }); return { session: current, promptId: 'prompt-1' } }
      if (operation === 'open-surface') return { sessionId: current.id, surfaceId: 'surface-1', focused: true }
      if (operation.startsWith('preview')) return { job: { id: 'preview-1', state: operation === 'preview-cancel' ? 'cancelled' : 'running', deadlineAt: '2026-09-25T12:00:10Z' } }
      return { session: current }
    },
  }
  return { host, abort, calls, listeners, setLocation: next => { location = next; listeners.get('host.location')?.(next) } }
}

test('context uses host identifiers, never a path as checkout authority', () => {
  assert.deepEqual(locationContext({ params: { projectId: 'p', directoryPath: '/private/path' }, search: '' }), { projectId: 'p', checkoutRef: '', sessionId: '' })
  assert.equal(locationContext({ params: { sessionId: 's' }, search: '' }).sessionId, 's')
  assert.throws(() => assertPrompt(' '), /Enter/)
  assert.doesNotThrow(() => assertPrompt('é'.repeat(17000)))
  assert.throws(() => assertPrompt('é'.repeat(4 * 1024 * 1024 + 1)), /8 MiB/)
})
test('effort choices belong only to an explicitly selected negotiated model', () => {
  const catalog = { configOptions: [{ category: 'model', currentValue: 'model-a' }] }
  assert.equal(configOptionsMatchModel(catalog, {}), false)
  assert.equal(configOptionsMatchModel(catalog, { modelId: 'model-b' }), false)
  assert.equal(configOptionsMatchModel(catalog, { modelId: 'model-a' }), true)
  assert.equal(configOptionsMatchModel({ configOptions: [] }, { modelId: 'model-a' }), false)
})
test('catalog consumes all pages and rejects a repeated cursor', async () => {
  const cursors = []
  const f = fixture({ catalog: request => { cursors.push(request.cursor); return request.cursor ? { providers: [{ ...provider, id: 'second' }] } : { providers: [provider], nextCursor: 'provider-1' } } })
  const controller = createController(f.host, () => {}, { pollInterval: 100000 })
  await tick()
  assert.deepEqual(cursors, [undefined, 'provider-1'])
  assert.deepEqual(controller.state.providers.map(row => row.id), ['coding-client', 'second'])
  controller.dispose()
  const repeated = fixture({ catalog: () => ({ providers: [provider], nextCursor: 'same' }) })
  const bad = createController(repeated.host, () => {}, { pollInterval: 100000 })
  await tick(); assert.match(bad.state.error, /repeated page cursor/); bad.dispose()
})
test('ordered history rejects cross-session and gaps; handles uint64 exactly', () => {
  const event = sequence => ({ sequence, sessionId: 's' })
  assert.equal(mergeEvents([], [event('1'), event('1'), event('2')], 's').length, 2)
  assert.throws(() => mergeEvents([], [event('2')], 's'), /gap/)
  assert.throws(() => mergeEvents([], [event('1')], 'other'), /identity/)
  assert.equal(mergeEvents([event('9007199254740992')], [event('9007199254740993')], 's').length, 2)
})
test('start explicitly creates then prompts; unmount does not terminate or replay', async () => {
  const f = fixture(); const controller = createController(f.host, () => {}, { pollInterval: 100000 })
  await tick()
  assert.equal(f.calls.some(([name]) => name === 'create'), false)
  controller.actions.setDraft('Fix the failing test')
  controller.actions.setPreferences({ routingPolicy: 'balanced', permissionMode: 'ask', nextTaskOverrides: { providerId: 'coding-client', modelId: 'real-model' } })
  await controller.actions.send()
  assert.deepEqual(f.calls.filter(([name]) => ['create', 'prompt'].includes(name)).map(([name]) => name), ['create', 'prompt'])
  const request = f.calls.find(([name]) => name === 'create')[1]
  assert.equal(request.checkoutRef, 'checkout-1')
  assert.equal(request.preferences.permissionMode, 'ask')
  assert.equal(request.preferences.nextTaskOverrides.modelId, 'real-model')
  assert.equal(controller.state.preferences.nextTaskOverrides, undefined)
  assert.equal(controller.state.session.id, 'session-1')
  await controller.actions.sessionAction('OpenSurface')
  assert.deepEqual(f.calls.find(([name]) => name === 'open-surface')[1], { sessionId: 'session-1' })
  f.abort.abort(); controller.dispose()
  assert.equal(f.listeners.size, 0)
  assert.equal(f.calls.some(([name]) => ['end', 'stop', 'complete'].includes(name)), false)
})
test('missing checkout cannot create, and malformed host replies fail closed', async () => {
  const f = fixture({ catalog: () => ({ providers: 'invented' }) })
  f.setLocation({ params: { projectId: 'project-1' }, search: '' })
  const controller = createController(f.host, () => {}, { pollInterval: 100000 })
  await tick()
  assert.match(controller.state.error, /incompatible/)
  controller.actions.setDraft('Do work')
  await controller.actions.send()
  assert.match(controller.state.error, /checkout/)
  assert.equal(f.calls.some(([name]) => name === 'create'), false)
  controller.dispose()
})
test('lost prompt reply does not retry or discard created durable session', async () => {
  const f = fixture({ prompt: () => { throw Error('Prompt status unknown') } })
  const controller = createController(f.host, () => {}, { pollInterval: 100000 })
  await tick(); controller.actions.setDraft('Do work'); await controller.actions.send()
  assert.equal(controller.state.session.id, 'session-1')
  assert.equal(controller.state.draft, 'Do work')
  assert.equal(f.calls.filter(([name]) => name === 'prompt').length, 1)
  assert.match(controller.state.error, /unknown/)
  controller.dispose()
})
test('route preview creates no session and cancellation uses its explicit job', async () => {
  const f = fixture(); const controller = createController(f.host, () => {}, { pollInterval: 100000 })
  await tick(); controller.actions.setDraft('Explain a test failure'); await controller.actions.preview()
  assert.equal(f.calls.some(([name]) => ['create', 'prompt', 'new-task'].includes(name)), false)
  assert.equal(controller.state.preview.id, 'preview-1')
  await controller.actions.cancelPreview()
  assert.deepEqual(f.calls.find(([name]) => name === 'preview-cancel')[1], { jobId: 'preview-1' })
  controller.dispose()
})
test('late generation responses cannot revive withdrawn content', async () => {
  let resolve
  const f = fixture({ catalog: () => new Promise(value => { resolve = value }) })
  let renders = 0
  const controller = createController(f.host, () => { renders++ }, { pollInterval: 100000 })
  controller.dispose(); const atDispose = renders
  resolve({ providers: [provider] }); await tick()
  assert.equal(renders, atDispose)
  assert.equal(f.listeners.size, 0)
})
test('payload text is assembled exactly and malformed offsets cannot loop', async () => {
  const f = fixture()
  f.host.request = async () => ({ data: btoa('hello'), nextOffset: '5', eof: true })
  assert.equal(await client(f.host).readText({ handleId: 'payload-1' }), 'hello')
  f.host.request = async () => ({ data: btoa('hello'), nextOffset: '9007199254740993', eof: false })
  await assert.rejects(client(f.host).readText({ handleId: 'payload-1' }), /Invalid content/)
})
test('failed history hydration retries with a reminted lease and releases hydrated duplicates', async () => {
  const f = fixture(); const original = f.host.request
  const offsets = []; const released = []; let page = 0
  f.host.request = async (subject, request) => {
    if (subject.endsWith('.events')) {
      offsets.push(request.afterSequence); page++
      if (request.afterSequence !== '0') return { events: [], lastSequence: '2', hasMore: false }
      return { events: [1, 2].map(n => ({ sessionId: 'session-1', taskId: 'task-1', sequence: String(n), at: '2026-09-25T12:00:00Z', kind: 'message', message: { role: 'assistant', content: { handleId: 'coding_p_' + page + '_' + n } } })), lastSequence: '2', hasMore: false }
    }
    if (subject.endsWith('payloads.v1.read')) {
      if (request.handleId === 'coding_p_1_1') throw new Error('Temporary chunk failure')
      return { data: btoa('done'), nextOffset: '4', eof: true }
    }
    if (subject.endsWith('payloads.v1.revoke')) { released.push(request.handleId); return { revoked: true } }
    return original(subject, request)
  }
  f.setLocation({ params: { sessionId: 'session-1' }, search: '' })
  const controller = createController(f.host, () => {}, { pollInterval: 100000 })
  await tick()
  assert.equal(controller.state.texts.has('1'), false)
  assert.equal(controller.state.textErrors.has('1'), true)
  assert.deepEqual(released, ['coding_p_1_2'])
  await controller.actions.refresh()
  assert.deepEqual(offsets, ['0', '0'])
  assert.equal(controller.state.texts.get('1'), 'done')
  assert.equal(controller.state.textErrors.size, 0)
  assert.deepEqual(released, ['coding_p_1_2', 'coding_p_2_1', 'coding_p_2_2'])
  controller.dispose()
})
test('navigation releases a committed upload that was never submitted to coding', async () => {
  for (const action of ['send', 'preview']) {
    const f = fixture(); const original = f.host.request
    let handle; let finishCommit; let reachedCommit
    const committed = new Promise(resolve => { reachedCommit = resolve })
    f.host.request = async (subject, request) => {
      if (!subject.includes('.payloads.')) return original(subject, request)
      const operation = subject.split('.').at(-1); f.calls.push([operation, request])
      if (operation === 'create') { handle = { id: 'coding_p_unsubmitted', providerId: 'gateway', providerGeneration: 'boot-1', purpose: 'coding-prompt', size: request.size, sha256: request.sha256, state: 'uploading', expiresAt: '2026-09-25T23:00:00Z' }; return { handle } }
      if (operation === 'append') return { nextOffset: String(Number(request.offset) + atob(request.data).length) }
      if (operation === 'commit') { reachedCommit(); return new Promise(resolve => { finishCommit = () => resolve({ handle: { ...handle, state: 'committed' } }) }) }
      if (operation === 'revoke') return { revoked: true }
      throw Error('Unexpected payload operation')
    }
    const controller = createController(f.host, () => {}, { pollInterval: 100000 })
    await tick(); controller.actions.setDraft('x'.repeat(40000))
    const sending = controller.actions[action]()
    await committed
    f.setLocation({ params: { projectId: 'different-project' }, search: '?checkoutRef=another-checkout' })
    finishCommit(); await sending
    assert.equal(f.calls.some(([operation]) => operation === 'prompt' || operation === 'preview'), false)
    assert.deepEqual(f.calls.filter(([operation]) => operation === 'revoke').map(([, request]) => request.handleId), ['coding_p_unsubmitted'])
    controller.dispose()
  }
})
