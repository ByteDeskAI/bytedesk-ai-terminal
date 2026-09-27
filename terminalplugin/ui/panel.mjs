import { createController } from './controller.mjs'
import { createView } from './view.mjs'

export function mount(element, host) {
  if (host.signal.aborted) return () => {}
  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'
  stylesheet.href = new URL('./panel.css', import.meta.url).href
  element.append(stylesheet)
  let controller
  let view
  let disposed = false
  const cleanup = () => {
    if (disposed) return
    disposed = true
    controller?.dispose()
    view?.remove()
    stylesheet.remove()
    host.signal.removeEventListener('abort', cleanup)
  }
  try {
    view = createView(element, () => controller.actions)
    controller = createController(host, state => view.render(state))
    host.signal.addEventListener('abort', cleanup, { once: true })
    if (host.signal.aborted) cleanup()
  } catch (error) { cleanup(); throw error }
  return cleanup
}
