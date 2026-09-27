import assert from 'node:assert/strict'
import test from 'node:test'
import { client } from '../terminalplugin/ui/api.mjs'

function uploadFixture(fail) {
  const calls = []; let handle; const bytes = []
  const host = { signal: new AbortController().signal, async request(subject, request) {
    const operation = subject.split('.').at(-1); calls.push([operation, request])
    if (fail === operation) throw new Error('Upload failed')
    if (operation === 'create') {
      handle = { id: 'coding_p_fixture', providerId: request.providerId, providerGeneration: 'boot-1', purpose: request.purpose, size: request.size, sha256: request.sha256, expiresAt: '2026-09-25T20:00:00Z', state: 'uploading' }
      return { handle }
    }
    if (operation === 'append') { const chunk = Buffer.from(request.data, 'base64'); assert.equal(Number(request.offset), bytes.length); bytes.push(...chunk); return { nextOffset: String(bytes.length) } }
    if (operation === 'commit') return { handle: { ...handle, state: 'committed' } }
    if (operation === 'revoke') return { revoked: true }
    throw Error('Unexpected operation')
  } }
  return { host, calls, bytes }
}

test('large UTF-8 prompts use bounded host coding uploads with exact digest', async () => {
  const f = uploadFixture(); const api = client(f.host)
  assert.deepEqual(await api.uploadText('small prompt'), { inline: 'small prompt' })
  assert.equal(f.calls.length, 0)
  const text = 'é'.repeat(20000)
  assert.deepEqual(await api.uploadText(text), { handleId: 'coding_p_fixture' })
  assert.equal(Buffer.from(f.bytes).toString('utf8'), text)
  assert.deepEqual(f.calls.map(([op]) => op), ['create', 'append', 'append', 'commit'])
  const create = f.calls[0][1]
  assert.equal(create.providerId, 'gateway'); assert.equal(create.purpose, 'coding-prompt')
  assert.equal(create.size, '40000'); assert.equal(create.invocationId, undefined)
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex')
  assert.equal(create.sha256, digest)
  for (const [operation, request] of f.calls) if (operation === 'append') assert.ok(Buffer.from(request.data, 'base64').length <= 24576)
})

test('partial upload failure releases only its own upload and never retries', async () => {
  const f = uploadFixture('append')
  await assert.rejects(client(f.host).uploadText('x'.repeat(40000)), /Upload failed/)
  assert.deepEqual(f.calls.map(([op]) => op), ['create', 'append', 'revoke'])
})

test('history releases a fully hydrated handle but keeps failed or partial reads', async () => {
  const calls = []
  const host = { signal: new AbortController().signal, async request(subject) {
    const op = subject.split('.').at(-1); calls.push(op)
    if (op === 'revoke') return { revoked: true }
    return { data: btoa('text'), nextOffset: '4', eof: true }
  } }
  assert.equal(await client(host).readText({ handleId: 'coding_p_output' }), 'text')
  assert.deepEqual(calls, ['read', 'revoke'])
  calls.length = 0
  host.request = async subject => { calls.push(subject.split('.').at(-1)); return { data: '/w==', nextOffset: '1', eof: true } }
  await assert.rejects(client(host).readText({ handleId: 'coding_p_output' }))
  assert.deepEqual(calls, ['read'])
  calls.length = 0
  host.request = async subject => { calls.push(subject.split('.').at(-1)); throw new Error('Temporary failure') }
  await assert.rejects(client(host).readText({ handleId: 'coding_p_output' }), /Temporary failure/)
  assert.deepEqual(calls, ['read'])
})
