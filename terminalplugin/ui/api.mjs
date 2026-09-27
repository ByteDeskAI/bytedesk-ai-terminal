import { descriptors } from './contracts/codingsessions/descriptors.js'
import * as coding from './contracts/codingsessions/validators.js'
import { descriptors as payloadDescriptors } from './contracts/payloads/descriptors.js'
import * as payloads from './contracts/payloads/validators.js'

const responses = {
  Catalog: 'CatalogResult', List: 'ListResult', Prompt: 'PromptResult',
  Events: 'EventsResult', OpenSurface: 'OpenSurfaceResult',
  Preview: 'PreviewJobResult', PreviewRead: 'PreviewJobResult', PreviewCancel: 'PreviewJobResult',
}
const requests = {
  Catalog: 'CatalogRequest', List: 'ListRequest', Create: 'CreateRequest',
  Prompt: 'PromptRequest', Stop: 'StopRequest', NewTask: 'NewTaskRequest',
  UpdatePreferences: 'PreferencesRequest', Approve: 'ApproveRequest',
  Events: 'EventsRequest', OpenSurface: 'OpenSurfaceRequest',
  Preview: 'PreviewRequest', PreviewRead: 'PreviewJobRequest', PreviewCancel: 'PreviewJobRequest',
}
export const changedEvent = descriptors.Changed.subject
export const MAX_INLINE_BYTES = 32 * 1024
export const MAX_PROMPT_BYTES = 8 * 1024 * 1024
export const MAX_CONTENT_BYTES = 8 * 1024 * 1024

export function client(host) {
  async function payloadCall(operation, request) {
    if (host.signal.aborted) throw new Error('This plugin generation is no longer available.')
    if (!payloads['is' + operation + 'Request'](request)) throw new Error('Invalid payload request.')
    const result = await host.request(payloadDescriptors[operation].subject, request)
    if (host.signal.aborted) throw new Error('This plugin generation is no longer available.')
    if (!payloads['is' + operation + 'Result'](result)) throw new Error('Incompatible content response.')
    return result
  }
  async function releaseText(input) {
    if (input.handleId) await payloadCall('Revoke', { handleId: input.handleId })
  }
  async function uploadText(text) {
    assertPrompt(text)
    const bytes = new TextEncoder().encode(text)
    if (bytes.length <= MAX_INLINE_BYTES) return { inline: text }
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('')
    let handleId
    try {
      // Reserved host coding consumer; never a discovered AI provider or path.
      const created = await payloadCall('Create', { providerId: 'gateway', purpose: 'coding-prompt', size: String(bytes.length), sha256, ttlSeconds: 300 })
      handleId = created.handle.id
      const matches = handle => handle.id === handleId && handle.providerId === 'gateway' && handle.purpose === 'coding-prompt' && handle.size === String(bytes.length) && handle.sha256 === sha256
      if (!matches(created.handle) || created.handle.state !== 'uploading') throw new Error('The host returned a different upload scope.')
      for (let offset = 0; offset < bytes.length; offset += 24576) {
        const chunk = bytes.subarray(offset, offset + 24576)
        const result = await payloadCall('Append', { handleId, offset: String(offset), data: btoa(String.fromCharCode(...chunk)) })
        if (BigInt(result.nextOffset) !== BigInt(offset + chunk.length)) throw new Error('The upload offset did not match.')
      }
      const committed = await payloadCall('Commit', { handleId })
      if (!matches(committed.handle) || committed.handle.state !== 'committed') throw new Error('The host did not seal the expected prompt.')
      return { handleId }
    } catch (error) {
      if (handleId && !host.signal.aborted) { try { await releaseText({ handleId }) } catch { /* Expiry remains the fallback. */ } }
      throw error
    }
  }
  async function call(operation, request) {
    if (host.signal.aborted) throw new Error('This plugin generation is no longer available.')
    const descriptor = descriptors[operation]
    if (!descriptor || descriptor.kind !== 'command') throw new Error('Unknown coding operation.')
    if (!coding['is' + (requests[operation] || 'SessionRequest')](request)) throw new Error('Invalid coding request.')
    const result = await host.request(descriptor.subject, request)
    if (host.signal.aborted) throw new Error('This plugin generation is no longer available.')
    if (!coding['is' + (responses[operation] || 'SessionResult')](result)) throw new Error('The host returned an incompatible coding response.')
    return result
  }
  async function readText(input) {
    if (typeof input?.inline === 'string' && !input.handleId) return input.inline
    if (!input?.handleId || input.inline) throw new Error('Missing session content.')
    const chunks = []
    let offset = 0
    while (offset < MAX_CONTENT_BYTES) {
      if (host.signal.aborted) throw new Error('Session view closed.')
      const request = { handleId: input.handleId, offset: String(offset), limit: 24576 }
      const result = await payloadCall('Read', request)
      const bytes = Uint8Array.from(atob(result.data), value => value.charCodeAt(0))
      if (bytes.length > 24576 || !/^\d+$/.test(result.nextOffset) || BigInt(result.nextOffset) !== BigInt(offset + bytes.length)) throw new Error('Invalid content chunk.')
      chunks.push(bytes)
      offset += bytes.length
      if (offset > MAX_CONTENT_BYTES) throw new Error('Session content exceeds the public 8 MiB limit.')
      if (result.eof) {
        const assembled = new Uint8Array(offset)
        let cursor = 0
        for (const chunk of chunks) { assembled.set(chunk, cursor); cursor += chunk.length }
        const text = new TextDecoder('utf-8', { fatal: true }).decode(assembled)
        // Each view owns its own lease. Partial/invalid reads never release it;
        // a failed release leaves expiry as the bounded cleanup fallback.
        try { await releaseText(input) } catch { /* Do not discard fully hydrated text. */ }
        if (host.signal.aborted) throw new Error('Session view closed.')
        return text
      }
      if (!bytes.length) throw new Error('Content did not advance.')
    }
    throw new Error('Session content exceeds the public 8 MiB limit.')
  }
  return { call, readText, uploadText, releaseText }
}

export function locationContext(location) {
  const params = location?.params || {}
  // Only identifiers projected by the host. Paths in a browser are not authority.
  return {
    projectId: params.projectId || params.project || '',
    checkoutRef: new URLSearchParams(location?.search || '').get('checkoutRef') || '',
    sessionId: params.sessionId || '',
  }
}
export function assertPrompt(text) {
  if (!text.trim()) throw new Error('Enter a task or follow-up.')
  if (new TextEncoder().encode(text).length > MAX_PROMPT_BYTES) throw new Error('Keep a prompt within 8 MiB.')
}
export function workUnitReference(value) {
  if (value === '') return undefined
  if (typeof value !== 'string' || value.length > 64 || !/^TM-[0-9]+$/.test(value) || !/[1-9]/.test(value.slice(3))) {
    throw new Error('Enter an exact Task Management ID such as TM-001, or leave the next-task work unit empty.')
  }
  // Preserve the selected identifier, including zero padding. The host alone
  // resolves its authorized store from project/checkout and binds the live task.
  return { taskId: value }
}
export function mergeEvents(existing, incoming, sessionId) {
  let sequence = existing.length ? BigInt(existing.at(-1).sequence) : 0n
  const result = [...existing]
  for (const event of incoming || []) {
    if (event.sessionId !== sessionId || !/^\d+$/.test(event.sequence)) throw new Error('Session event identity is invalid.')
    const next = BigInt(event.sequence)
    if (next <= sequence) continue
    if (next !== sequence + 1n) throw new Error('Session history has a gap. Reload the session before continuing.')
    result.push(event)
    sequence = next
  }
  return result
}
