/**
 * Framework-independent SDK UI module. The host provides only the versioned
 * PluginUIHost facade; no host component, router, store or renderer is imported.
 * @type {import('@bytedesk/gateway-plugin-ui').PluginUIModule['mount']}
 */
export function mount(element, host) {
  if (host.signal.aborted) return () => {}
  const document = element.ownerDocument
  const title = document.createElement('h1')
  title.textContent = 'Example plugin'
  const location = document.createElement('p')
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Open example item'
  let disposed = false
  const renderLocation = (next) => {
    if (disposed || host.signal.aborted) return
    const current = next ?? host.location()
    location.textContent = current.params.item ? `Item: ${current.params.item}` : 'Independent plugin document'
  }
  const navigate = () => host.navigate('/example/view/demo')
  renderLocation()
  button.addEventListener('click', navigate)
  element.replaceChildren(title, location, button)
  let unsubscribe = () => {}
  const cleanup = () => {
    if (disposed) return
    disposed = true
    host.signal.removeEventListener('abort', cleanup)
    button.removeEventListener('click', navigate)
    try { unsubscribe() } finally { element.replaceChildren() }
  }
  try {
    unsubscribe = host.subscribe('host.location', renderLocation)
    host.signal.addEventListener('abort', cleanup, { once: true })
    // A facade may be withdrawn while subscription admission is in progress.
    if (host.signal.aborted) cleanup()
  } catch (error) {
    cleanup()
    throw error
  }
  return cleanup
}
