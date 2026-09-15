// Independent browser contract fixture; this does not prove live host authority.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const moduleBytes = await readFile(new URL('../exampleplugin/panel.mjs', import.meta.url))
const server = createServer((request, response) => {
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; object-src 'none'")
  if (request.url === '/panel.mjs') {
    response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
    response.end(moduleBytes)
  } else {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<!doctype html><title>Independent plugin fixture</title><main id="panel"></main>')
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const results = await page.evaluate(async () => {
    const violations = []
    document.addEventListener('securitypolicyviolation', event => violations.push(event.violatedDirective))
    const { mount } = await import('/panel.mjs')
    const element = document.getElementById('panel')
    const check = (condition, message) => { if (!condition) throw Error(message) }
    const controller = new AbortController()
    let location = { pathname: '/example', search: '', hash: '', params: {} }
    let handler
    let subscriptions = 0
    let disposals = 0
    let navigation
    const host = {
      identity: { major: 1, features: ['ui.mount.v1'], pluginId: 'example', generation: 'g1' },
      signal: controller.signal,
      location: () => location,
      navigate: path => { navigation = path },
      request: () => { throw Error('unexpected host command') },
      subscribe(type, callback) {
        check(type === 'host.location', 'unexpected topic')
        subscriptions++
        handler = callback
        return () => { disposals++ }
      },
    }
    const cleanup = mount(element, host)
    check(element.querySelector('h1')?.textContent === 'Example plugin', 'initial mount failed')
    element.querySelector('button').click()
    check(navigation === '/example/view/demo', 'navigation did not use host port')
    const nextLocation = { pathname: '/example/view/demo', search: '', hash: '', params: { item: 'demo' } }
    handler(nextLocation) // Delivery may precede updating the host getter.
    location = nextLocation
    check(element.querySelector('p')?.textContent === 'Item: demo', 'location port did not update')
    controller.abort()
    cleanup()
    check(element.childElementCount === 0 && disposals === 1, 'withdrawal cleanup was not exactly once')
    handler(location)
    check(element.childElementCount === 0, 'late callback revived withdrawn content')
    mount(element, host)()
    check(subscriptions === 1 && element.childElementCount === 0, 'aborted generation mounted again')

    const next = new AbortController()
    const cleanupNext = mount(element, { ...host, signal: next.signal, identity: { ...host.identity, generation: 'g2' } })
    check(element.querySelector('p')?.textContent === 'Item: demo', 'new generation failed to mount')
    cleanupNext()
    check(disposals === 2 && element.childElementCount === 0, 'new generation failed cleanup')

    let failed = false
    try {
      mount(element, { ...host, signal: new AbortController().signal, subscribe() { throw Error('admission denied') } })
    } catch { failed = true }
    check(failed && element.childElementCount === 0, 'partial mount leaked after subscription denial')
    await new Promise(resolve => setTimeout(resolve, 0))
    check(violations.length === 0, 'CSP violation: ' + violations.join(', '))
    return { mount: true, navigation: true, location: true, withdrawal: true, reinstall: true, partialFailure: true }
  })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ...results, pageErrors: errors, browser: await browser.version() }))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
