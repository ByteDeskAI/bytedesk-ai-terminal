// Local UI contract fixture, NOT Gateway/Store/ACP acceptance. There are no real
// providers, processes, worktrees, or credentials behind this page.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname } from 'node:path'
const root = fileURLToPath(new URL('../terminalplugin/ui/', import.meta.url))
const tokens = process.env.AI_TERMINAL_TEST_TOKENS
const server = createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'")
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/responsive') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end('<!doctype html><meta charset="utf-8"><title>AI Terminal — narrow/light fixture</title><p>390px iframe viewport; UI fixture only.</p><iframe width="390" height="844" title="Narrow AI Terminal" src="/?missing=1&light=1"></iframe>')
      return
    }
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Terminal — UI fixture only</title><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/fixture.css"></head><body><p>UI contract fixture only — no live Gateway or ACP authority.</p><main id="terminal"></main><script type="module" src="/fixture.mjs"></script></body></html>')
      return
    }
    if (url.pathname === '/fixture.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('./fixture.mjs', import.meta.url))); return }
    if (url.pathname === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end('body { margin: 0; font-family: var(--bd-font-sans); font-size: 14px; } body > p { padding: 12px 16px; margin: 0; font-size: 12px; }'); return }
    if (url.pathname === '/tokens.css' && tokens) { res.setHeader('Content-Type', 'text/css'); res.end(await readFile(tokens)); return }
    const target = resolve(root, '.' + url.pathname)
    if (!target.startsWith(root)) { res.writeHead(404); res.end(); return }
    res.setHeader('Content-Type', extname(target) === '.css' ? 'text/css' : 'text/javascript')
    res.end(await readFile(target))
  } catch { res.writeHead(404); res.end() }
})
server.listen(0, '127.0.0.1', () => console.log('UI fixture: http://127.0.0.1:' + server.address().port))
