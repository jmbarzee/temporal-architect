// Gate 5's artifact, captured reproducibly.
//
// VERIFICATION.md §3.1 Gate 5 is a *judgement* gate — "not automated; do it
// yourself" — and this does not automate the judging. It captures criterion 6,
// the committed PNG, so that the evidence for a pass is produced the same way
// every unit instead of by hand each time.
//
// Zero dependencies, per C2: system Chrome driven over the DevTools protocol
// using node's global WebSocket (node >= 22). No puppeteer, no playwright.
//
//   node verify/screenshot.mjs <unit> [--port 5178] [--out kickoff/screenshots]
//
// Expects a dev server already running (`npm run dev`), because the gate is a
// pass over the *running app*, not over a build artifact.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FIXTURES = [
  'nexus-sample', 'taskqueues-sample', 'stress-sample',
  'multifile-sample', 'decomposition-sample',
]

const args = process.argv.slice(2)
const unit = args[0]
if (!unit) {
  console.error('usage: node verify/screenshot.mjs <unit> [--port N] [--out DIR]')
  process.exit(2)
}
const flag = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const port = flag('--port', '5178')
const outDir = flag('--out', 'kickoff/screenshots')
const cdpPort = 9222

const sleep = ms => new Promise(r => setTimeout(r, ms))

const profile = join(tmpdir(), `twf-shot-${process.pid}`)
mkdirSync(profile, { recursive: true })
mkdirSync(outDir, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profile}`,
  '--window-size=1400,1000',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' })

let ws
let nextId = 1
const pending = new Map()

function send(method, params = {}, sessionId) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`)
      const { webSocketDebuggerUrl } = await r.json()
      ws = new WebSocket(webSocketDebuggerUrl)
      await new Promise((res, rej) => {
        ws.addEventListener('open', res, { once: true })
        ws.addEventListener('error', rej, { once: true })
      })
      ws.addEventListener('message', ev => {
        const msg = JSON.parse(ev.data)
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id)
          pending.delete(msg.id)
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
        }
      })
      return
    } catch { await sleep(250) }
  }
  throw new Error('could not reach Chrome DevTools')
}

// Everything below runs in the page. Kept as source strings so the script has
// no build step and stays readable next to what it asserts.
const CLICK_GRAPH = `
  (() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.textContent.trim() === 'Graph' && !x.disabled)
    if (!b) return 'no Graph tab'
    b.click()
    return 'ok'
  })()`

// Turn every filter chip ON, so the capture shows the whole graph rather than
// whichever subset happens to be default-visible.
//
// The chips carry their state in `title`: "Show workers" when off, "Hide
// workers" when on. So selecting the "Show " ones selects exactly the off ones,
// and clicking until none remain is self-terminating rather than a toggle race.
// Two details that cost a wrong capture each before they were pinned down:
// `aria-label` is not what these use (the accessible name comes from `title`),
// and the file chips use `title={file}` — clicking one of those would switch the
// file filter on and hide everything else, so the "Show " prefix is load-bearing,
// not decoration.
const ALL_CHIPS_ON = `
  (() => {
    let clicked = 0
    for (let pass = 0; pass < 12; pass++) {
      const off = [...document.querySelectorAll('button[title^="Show "]')]
        .filter(b => b.offsetParent !== null)
      if (off.length === 0) break
      off[0].click()
      clicked++
    }
    const left = [...document.querySelectorAll('button[title^="Show "]')]
      .filter(b => b.offsetParent !== null).length
    return JSON.stringify({ clicked, stillOff: left })
  })()`

const COUNTS = `
  (() => {
    const el = [...document.querySelectorAll('*')]
      .find(e => e.children.length === 0 && /^\\d+ nodes, \\d+ edges$/.test(e.textContent.trim()))
    return el ? el.textContent.trim() : 'counts not found'
  })()`

const ERRORS_HOOK = `
  (() => {
    window.__twfErrors = [];
    addEventListener('error', e => window.__twfErrors.push(String(e.message)));
    addEventListener('unhandledrejection', e => window.__twfErrors.push('rejection: ' + e.reason));
    const ce = console.error;
    console.error = (...a) => { window.__twfErrors.push(a.map(String).join(' ')); ce(...a) };
    return 'hooked'
  })()`

async function main() {
  await connect()
  const { targetInfos } = await send('Target.getTargets')
  const page = targetInfos.find(t => t.type === 'page')
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
  const evalIn = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)
    return r.result?.value
  }

  await send('Page.enable', {}, sessionId)
  const results = []

  for (const fixture of FIXTURES) {
    const url = `http://localhost:${port}/?ast=/fixtures/${fixture}.json`
    await send('Page.navigate', { url }, sessionId)
    await sleep(2500)
    await evalIn(ERRORS_HOOK)
    const tab = await evalIn(CLICK_GRAPH)
    if (tab !== 'ok') throw new Error(`${fixture}: ${tab}`)
    await sleep(1200)
    let chips = await evalIn(ALL_CHIPS_ON)
    // React re-renders the titles, so a single synchronous pass can leave some
    // off; settle and sweep again until the sweep is a no-op.
    for (let i = 0; i < 6; i++) {
      await sleep(400)
      const again = await evalIn(ALL_CHIPS_ON)
      if (JSON.parse(again).clicked === 0) { chips = again; break }
      chips = again
    }
    await sleep(4000)                       // let the layout settle before capturing
    const counts = await evalIn(COUNTS)
    const errors = await evalIn('JSON.stringify(window.__twfErrors || [])')

    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
    const file = join(outDir, `${unit}-${fixture}.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    results.push({ fixture, counts, chips, errors, file })
    console.log(`  ${fixture.padEnd(22)} ${counts.padEnd(20)} chips=${chips}  errors=${errors}`)
  }

  console.log(`\nwrote ${results.length} screenshot(s) to ${outDir}/`)
  const bad = results.filter(r => r.errors !== '[]')
  if (bad.length) {
    console.error('APPLICATION ERRORS on: ' + bad.map(b => b.fixture).join(', '))
    process.exitCode = 1
  }
}

try {
  await main()
} catch (err) {
  console.error('screenshot: ' + err.message)
  process.exitCode = 1
} finally {
  try { ws?.close() } catch {}
  chrome.kill()
  try { rmSync(profile, { recursive: true, force: true }) } catch {}
}
