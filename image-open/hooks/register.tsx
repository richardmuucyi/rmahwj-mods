import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry } from '../types'

// One entry per [Image #N] token now in the prompt box.
const images = atom({ plugin: 'image-open', key: 'images' } as const, [])

// The evidence trail lives in the temp folder, beside the saved pictures (see logFile): it outlives a session, stays out
// of the vault, and sits outside the mod folder, so writing it never trips the hot-reload watch.
const MAX_LINES = 300
// How often the box is read. A token appears about 3 s after Alt+V, so this is never the slow part.
const POLL_MS = 400
const TOKEN = /\[Image #(\d+)\]/g

const lines: string[] = []
let writing: Promise<void> = Promise.resolve()
// Numbers whose clipboard read is queued or running.
const pending = new Set<number>()
let queue: Promise<void> = Promise.resolve()
let isSyncing = false

/** JSON-quote a string so control and invisible characters show; clip it, keeping the true length. */
function show(s: string, n = 200): string {
  const j = JSON.stringify(s)
  return j.length > n ? `${j.slice(0, n)}…(${s.length} chars)` : j
}

let logPath: string | undefined

/**
 * Where the log goes: `<temp>/image-open/image-open.log`, forward slashes, the same folder the pictures are saved in.
 * Beside the mod only if Windows reports no temp folder at all.
 */
async function logFile($: EngineInterface): Promise<string> {
  if (logPath === undefined) {
    const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMP'))
    logPath =
      temp === undefined ? `${$.plugin.root}/image-open.log` : `${temp.replace(/\\/g, '/').replace(/\/+$/, '')}/image-open/image-open.log`
  }
  return logPath
}

/** Start the in-memory log from what an earlier session left in the file, so the file keeps accumulating. */
async function seedLog($: EngineInterface): Promise<void> {
  if (lines.length > 0) return
  try {
    const old = await $.fs.read(await logFile($))
    if (typeof old === 'string') lines.push(...old.split('\n').filter(l => l.trim() !== '').slice(-MAX_LINES))
  } catch {
    // No earlier log: start a new one.
  }
}

/** Append one line to the log file. Never throws: logging must not get in the prompt's way. */
async function record($: EngineInterface, kind: string, detail: string): Promise<void> {
  try {
    const at = new Date(await $.clock.now()).toISOString().slice(11, 23)
    lines.push(`${at} ${kind.padEnd(10)} ${detail}`)
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
    const text = `${lines.join('\n')}\n`
    const file = await logFile($)
    writing = writing.then(() => $.fs.write(file, text)).catch(() => {})
    await writing
  } catch {
    // Logging failed: carry on.
  }
}

/** True when a drawing shows nothing (an empty box or blank text): such a tree only adds a blank row. */
function isBlank(n: unknown): boolean {
  if (n === null || n === undefined || n === false || n === true) return true
  if (typeof n === 'string') return n.trim() === ''
  if (typeof n === 'number') return false
  if (Array.isArray(n)) return n.every(isBlank)
  const el = n as { type?: unknown; children?: unknown[] }
  if (el.type === 'Box' || el.type === 'Text') return (el.children ?? []).every(isBlank)
  return false
}

type Clip =
  | { kind: 'ok'; w: number; h: number; path: string }
  | { kind: 'none' }
  | { kind: 'error'; why: string; label: string }

/**
 * Ask PowerShell to save the picture on the Windows clipboard as a full-size PNG named `name` in the temp folder
 * (scripts/clip-save.ps1); the [open] button hands that file to the default viewer.
 */
async function readClipboard($: EngineInterface, name: string): Promise<Clip> {
  try {
    const ran = await $.process.run(
      [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        `${$.plugin.root}/scripts/clip-save.ps1`,
        '-SaveName',
        name,
      ],
      { timeoutMs: 15_000 },
    )
    if (ran.exitCode !== 0) {
      return { kind: 'error', label: 'could not read', why: `powershell exit ${ran.exitCode}: ${ran.stderr.trim().slice(0, 160)}` }
    }
    const out = ran.stdout.trim().split(/\r?\n/)
    if (out[0] === 'NOIMAGE') return { kind: 'none' }
    if (out[0]?.startsWith('NOSAVE')) return { kind: 'error', label: 'could not save', why: out[0].slice(0, 200) }
    const [, w, h] = (out[0] ?? '').split(' ').map(Number)
    const saved = out.find(line => line.startsWith('SAVED '))
    const path = saved === undefined ? '' : saved.slice('SAVED '.length).trim()
    if (!out[0]?.startsWith('OK ') || !w || !h || path === '') {
      return { kind: 'error', label: 'could not read', why: `unexpected output: ${show(ran.stdout, 120)}` }
    }
    return { kind: 'ok', w, h, path }
  } catch (err) {
    return { kind: 'error', label: 'could not read', why: String(err).slice(0, 160) }
  }
}

/** Read the clipboard for token n and fill its entry: the saved file, or why there is none. */
async function grab($: EngineInterface, n: number): Promise<void> {
  try {
    const started = await $.clock.now()
    // The time is in the name so a viewer still holding an earlier copy never blocks the write.
    const name = `image-${n}-${started}`
    let clip = await readClipboard($, name)
    if (clip.kind === 'none') {
      // Claude Code puts the token in the box a moment before it has finished with the clipboard: try once more.
      await $.clock.sleep(600)
      clip = await readClipboard($, name)
    }
    const ms = (await $.clock.now()) - started
    if (clip.kind === 'ok') {
      const done: Entry = { n, w: clip.w, h: clip.h, path: clip.path }
      await update($, images, list => list.map(t => (t.n === n ? done : t)))
      await record($, 'captured', `#${n} ${clip.w}x${clip.h}, ${ms} ms, saved ${clip.path}`)
    } else {
      const label = clip.kind === 'none' ? 'no picture' : clip.label
      const why = clip.kind === 'none' ? 'no picture on the clipboard' : clip.why
      await update($, images, list => list.map(t => (t.n === n ? { n, failed: label } : t)))
      await record($, 'failed', `#${n} ${why} (${ms} ms)`)
      $.ui.toast(`image-open: no full-size copy of [Image #${n}] (${why})`)
    }
  } catch (err) {
    await record($, 'error', `#${n} ${String(err).slice(0, 160)}`)
  } finally {
    pending.delete(n)
  }
}

/** The [open] button: hand the full-size copy of image n to Windows, which opens it in the default viewer. */
async function openFull($: EngineInterface, n: number, path: string): Promise<void> {
  try {
    const started = await $.clock.now()
    // explorer.exe opens a file in the program Windows has for it; it usually exits with 1 even when that worked.
    const ran = await $.process.run(['explorer.exe', path], { timeoutMs: 10_000 })
    const ms = (await $.clock.now()) - started
    await record($, 'open', `#${n} ${path} (explorer exit ${ran.exitCode}, ${ms} ms)`)
  } catch (err) {
    await record($, 'error', `open #${n}: ${String(err).slice(0, 160)}`)
    $.ui.toast(`image-open: could not open [Image #${n}]`)
  }
}

/** Compare the box with the entries: start a read for each new token, drop the ones whose token has left. */
async function sync($: EngineInterface): Promise<void> {
  if (isSyncing) return
  isSyncing = true
  try {
    const { text } = await $.prompt.read()
    const inBox: number[] = []
    for (const m of text.matchAll(TOKEN)) {
      const n = Number(m[1])
      if (!inBox.includes(n)) inBox.push(n)
    }
    const list = await read($, images)
    const have = new Set(list.map(t => t.n))
    const fresh = inBox.filter(n => !have.has(n))
    const gone = list.filter(t => !inBox.includes(t.n))
    // Left unfinished by a reload while the read was running.
    const stale = list
      .filter(t => inBox.includes(t.n) && t.path === undefined && t.failed === undefined && !pending.has(t.n))
      .map(t => t.n)

    if (fresh.length > 0 || gone.length > 0) {
      await update($, images, cur =>
        [...cur.filter(t => inBox.includes(t.n)), ...fresh.map(n => ({ n }))].sort((a, b) => a.n - b.n),
      )
    }
    for (const t of gone) await record($, 'gone', `[Image #${t.n}] left the box`)
    for (const n of [...fresh, ...stale]) {
      pending.add(n)
      await record($, 'token', `[Image #${n}] in the box; box=${show(text)}`)
      queue = queue.then(() => grab($, n)).catch(() => {})
    }
  } catch {
    // No box mounted yet, or a dialog holds it: try again next period.
  } finally {
    isSyncing = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await seedLog($)
    await record($, 'start', `image-open armed: polling the box every ${POLL_MS} ms for [Image #N]`)
    $.clock.every(POLL_MS, () => {
      void sync($)
    })
    return started
  })

  // An empty edit with no key is what a paste gesture sometimes looked like in the first probe log.
  on('prompt.edit', async ($, e, next) => {
    if (e.key === undefined && e.inputText === '') await record($, 'gesture', 'empty prompt.edit with no key')
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const attached = (e.attachments ?? []).map(a => `${a.type}/${a.mediaType ?? '?'}`).join(', ')
    if (attached !== '') await record($, 'submit', `sent with attachments: ${attached}`)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, images)
    if (list.length === 0 || e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const beneath = await next(e)

    return (
      <Box flexDirection="column">
        <Box key="io-row" flexDirection="row" flexWrap="wrap" columnGap={3}>
          {list.map(t => {
            const path = t.path
            const label =
              t.failed !== undefined
                ? `Image #${t.n}  ${t.failed}`
                : t.w !== undefined
                  ? `Image #${t.n}  ${t.w}×${t.h}`
                  : `Image #${t.n}  reading…`
            return (
              <Box key={`io-${t.n}`} flexDirection="row" columnGap={1}>
                <Text dimColor>{label}</Text>
                {path !== undefined && <Button key={`io-open-${t.n}`} label="open" onPress={() => openFull($, t.n, path)} />}
              </Box>
            )
          })}
        </Box>
        {!isBlank(beneath) && beneath}
      </Box>
    )
  })
}
