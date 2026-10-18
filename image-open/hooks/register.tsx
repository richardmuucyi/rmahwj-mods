import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry } from '../types'
import { blockCells, drawsPictures, fitRow, imageNumbers, pngSize } from './layout'
import { decodeThumb } from './png'

// One entry per [Image #N] token now in the prompt box.
const images = atom({ plugin: 'image-open', key: 'images' } as const, [])

// The evidence trail lives in the temp folder (see logFile): it outlives a session, stays out of the vault, and sits
// outside the mod folder, so writing it never trips the hot-reload watch.
const MAX_LINES = 300
// How often the box is read. Pasting raises no prompt.edit (the token turns up after the paste), so it is polled.
const POLL_MS = 200
// How many polls a token waits for Claude Code's copy of the paste before its tile says there is none (about 3 s).
const FIND_TRIES = 15

const lines: string[] = []
let writing: Promise<void> = Promise.resolve()
let isSyncing = false
let logPath: string | undefined
// Claude Code's temp folder, and this session's images folder inside it once found.
let tmpRoot: string | undefined
let found: { sessionId: string; dir: string } | undefined
// How many polls each token has waited for its file.
const tries = new Map<number, number>()
// The `thumbnails` option. Off, the band is the label and [open] alone, as in 0.1.
let isThumbs = true
// Read once a load: Windows or not, and whether Claude Code draws real pixels in this terminal.
let isWindows: boolean | undefined
let isPictures: boolean | undefined

/** JSON-quote a string so control and invisible characters show; clip it, keeping the true length. */
function show(s: string, n = 200): string {
  const j = JSON.stringify(s)
  return j.length > n ? `${j.slice(0, n)}…(${s.length} chars)` : j
}

/** Forward slashes, no trailing one. */
function slashes(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Windows or not. A hooks module has no platform call, and Windows always sets OS=Windows_NT. */
async function onWindows($: EngineInterface): Promise<boolean> {
  isWindows ??= (await $.env.get('OS')) === 'Windows_NT'
  return isWindows
}

/** Whether Claude Code draws `Image` as pixels here (kitty, Ghostty): it does not say, so go by what it decides from. */
async function canDrawPictures($: EngineInterface): Promise<boolean> {
  // Each name spelled out: the engine lists the variables a module reads from its literal calls.
  if (isPictures === undefined) {
    isPictures = drawsPictures({
      IMAGE_OPEN_RENDERER: await $.env.get('IMAGE_OPEN_RENDERER'),
      CLAUDE_CODE_FORCE_TERMINAL_IMAGES: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
      CLAUDE_CODE_SESSION_KIND: await $.env.get('CLAUDE_CODE_SESSION_KIND'),
      TMUX: await $.env.get('TMUX'),
      STY: await $.env.get('STY'),
      KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
      GHOSTTY_RESOURCES_DIR: await $.env.get('GHOSTTY_RESOURCES_DIR'),
      TERM: await $.env.get('TERM'),
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    })
  }
  return isPictures
}

/** Where the log goes: `<temp>/image-open/image-open.log`, forward slashes. Beside the mod only if there is no temp folder. */
async function logFile($: EngineInterface): Promise<string> {
  if (logPath === undefined) {
    const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMP')) ?? (await $.env.get('TMPDIR'))
    logPath = temp === undefined ? `${$.plugin.root}/image-open.log` : `${slashes(temp)}/image-open/image-open.log`
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

/**
 * Claude Code's temp folder. Windows: `<base>/claude`, the base being CLAUDE_CODE_TMPDIR, else TEMP. macOS and Linux:
 * `<base>/claude-<uid>`, the base being CLAUDE_CODE_TMPDIR, else /tmp (not TMPDIR).
 */
async function tempRoot($: EngineInterface): Promise<string | undefined> {
  const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
  if (await onWindows($)) {
    const base = fromEnv ?? (await $.env.get('TEMP')) ?? (await $.env.get('TMP'))
    return base === undefined ? undefined : `${slashes(base)}/claude`
  }
  const uid = await $.process.run(['id', '-u']).then(
    ran => ran.stdout.trim(),
    () => '',
  )
  return uid === '' ? undefined : `${slashes(fromEnv ?? '/tmp')}/claude-${uid}`
}

/**
 * Claude Code keeps each paste as `<temp folder>/<project>/<session>/images/<n>.png`. The project folder is named after
 * a working directory that may since have moved, so it is found by the session id instead of rebuilt.
 */
async function imagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (found?.sessionId === sessionId) return found.dir
  tmpRoot ??= await tempRoot($)
  if (tmpRoot === undefined) return undefined
  const entries = await $.fs.list(tmpRoot).catch(() => [])
  for (const entry of entries) {
    const dir = `${tmpRoot}/${entry.name}/${sessionId}/images`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      found = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

/** The file of paste n: `<n>.png`, else `<n>.<another extension>` (a dropped JPEG, say). */
async function fileFor($: EngineInterface, dir: string, n: number): Promise<string | undefined> {
  const png = `${dir}/${n}.png`
  if (await $.fs.exists(png)) return png
  const entries = await $.fs.list(dir).catch(() => [])
  const other = entries.find(entry => entry.kind === 'file' && entry.name.startsWith(`${n}.`))
  return other === undefined ? undefined : `${dir}/${other.name}`
}

/**
 * A PNG copy of a paste that is not one (JPEG, HEIC, WebP), since a terminal draws only PNG from a file and the decoder
 * reads only PNG. Made once with macOS's sips, beside the session's images folder. Windows has no sips: undefined.
 */
async function pngCopy($: EngineInterface, dir: string, n: number, source: string): Promise<string | undefined> {
  if (await onWindows($)) return undefined
  const out = `${dir.replace(/\/images$/, '')}/image-open-${n}.png`
  if (await $.fs.exists(out)) return out
  const { exitCode } = await $.process
    .run(['sips', '-s', 'format', 'png', '-Z', '800', source, '--out', out])
    .catch(() => ({ exitCode: 1 }))
  return exitCode === 0 ? out : undefined
}

/** A file's bytes, or why they could not be read (over the 4 MiB read limit, or held open). */
async function bytesOf($: EngineInterface, path: string): Promise<Uint8Array | string> {
  try {
    return Uint8Array.fromBase64((await $.fs.read(path, { as: 'bytes' })).base64)
  } catch (err) {
    return String(err).slice(0, 120)
  }
}

/**
 * Look for paste n's file. Found: read its size and make what its tile draws (the PNG for pixels, or a decoded
 * thumbnail for half blocks), then fill its entry. Not yet: count the poll, and after FIND_TRIES polls say there is none.
 */
async function find($: EngineInterface, n: number): Promise<void> {
  const started = await $.clock.now()
  const dir = await imagesDir($)
  const path = dir === undefined ? undefined : await fileFor($, dir, n)
  const isPng = path !== undefined && /\.png$/i.test(path)
  const got = isPng ? await bytesOf($, path) : undefined
  const bytes = got instanceof Uint8Array ? got : undefined
  const size = bytes === undefined ? null : pngSize(bytes)
  // A PNG no longer than its header may still be being written: wait for it as for a missing file.
  const isPartial = bytes !== undefined && size === null && bytes.length <= 32

  if (dir === undefined || path === undefined || isPartial) {
    const k = (tries.get(n) ?? 0) + 1
    tries.set(n, k)
    if (k < FIND_TRIES) return
    tries.delete(n)
    await update($, images, list => list.map(t => (t.n === n ? { n, failed: 'no file' } : t)))
    const where = dir ?? `${tmpRoot ?? 'the temp folder'} (no folder for this session)`
    await record($, 'failed', `#${n} no file for it in ${where} after ${k} looks`)
    $.ui.toast(`image-open: Claude Code's copy of [Image #${n}] was not found`)
    return
  }

  tries.delete(n)
  const entry: Entry = { n, path }
  if (size !== null) {
    entry.w = size.width
    entry.h = size.height
  }
  let detail: string
  if (!isThumbs) {
    detail = 'thumbnails off'
  } else if (isPng && bytes === undefined && !(await canDrawPictures($))) {
    entry.note = 'no preview'
    detail = `could not read it: ${got}`
  } else {
    const png = isPng ? path : await pngCopy($, dir, n, path)
    if (png === undefined) {
      entry.note = 'no preview'
      detail = 'not a PNG, no thumbnail'
    } else if (await canDrawPictures($)) {
      // The terminal reads the file itself, so a PNG over the 4 MiB read limit still draws (in a default shape).
      entry.png = png
      detail = png === path ? 'drawn as pixels' : `converted to ${png}, drawn as pixels`
      if (png !== path) {
        const copy = await bytesOf($, png)
        const copySize = copy instanceof Uint8Array ? pngSize(copy) : null
        if (copySize !== null) {
          entry.w = copySize.width
          entry.h = copySize.height
        }
      }
    } else {
      const source = png === path ? bytes : await bytesOf($, png)
      const thumb = source instanceof Uint8Array ? decodeThumb(source) : null
      if (source instanceof Uint8Array && png !== path) {
        const copySize = pngSize(source)
        if (copySize !== null) {
          entry.w = copySize.width
          entry.h = copySize.height
        }
      }
      if (thumb !== null) {
        entry.thumb = { width: thumb.width, height: thumb.height, rgb: thumb.rgb.toBase64() }
        detail = `thumb ${thumb.width}x${thumb.height}${png === path ? '' : ` from ${png}`}`
      } else {
        entry.note = 'no preview'
        detail = typeof source === 'string' ? `could not read ${png}: ${source}` : 'could not decode it'
      }
    }
  }
  await update($, images, list => list.map(t => (t.n === n ? entry : t)))
  const ms = (await $.clock.now()) - started
  await record($, 'found', `#${n} ${entry.w ?? '?'}x${entry.h ?? '?'}, ${detail}, ${ms} ms, ${path}`)
}

/** The [open] button: hand image n's file to the system, which opens it in the default viewer. */
async function openFull($: EngineInterface, n: number, path: string): Promise<void> {
  try {
    const started = await $.clock.now()
    // explorer.exe wants backslashes and usually exits with 1 even when the viewer opened; macOS has `open`.
    const windows = await onWindows($)
    const argv = windows ? ['explorer.exe', path.replace(/\//g, '\\')] : ['open', path]
    const ran = await $.process.run(argv, { timeoutMs: 10_000 })
    const ms = (await $.clock.now()) - started
    await record($, 'open', `#${n} ${path} (${windows ? 'explorer' : 'open'} exit ${ran.exitCode}, ${ms} ms)`)
  } catch (err) {
    await record($, 'error', `open #${n}: ${String(err).slice(0, 160)}`)
    $.ui.toast(`image-open: could not open [Image #${n}]`)
  }
}

/** Compare the box with the entries: add new tokens, drop the ones that left, and look for every file still missing. */
async function sync($: EngineInterface): Promise<void> {
  if (isSyncing) return
  isSyncing = true
  try {
    const { text } = await $.prompt.read()
    const inBox = imageNumbers(text)
    const list = await read($, images)
    const have = new Set(list.map(t => t.n))
    const fresh = inBox.filter(n => !have.has(n))
    const gone = list.filter(t => !inBox.includes(t.n))
    if (fresh.length > 0 || gone.length > 0) {
      await update($, images, cur =>
        [...cur.filter(t => inBox.includes(t.n)), ...fresh.map(n => ({ n }))].sort((a, b) => a.n - b.n),
      )
    }
    for (const t of gone) {
      tries.delete(t.n)
      await record($, 'gone', `[Image #${t.n}] left the box`)
    }
    for (const n of fresh) await record($, 'token', `[Image #${n}] in the box; box=${show(text)}`)
    // Every token still without its file; and, once the option is turned on, every entry found while it was off.
    const waiting = (await read($, images)).filter(
      t =>
        t.failed === undefined &&
        (t.path === undefined || (isThumbs && t.thumb === undefined && t.png === undefined && t.note === undefined)),
    )
    for (const t of waiting) await find($, t.n)
  } catch {
    // No box mounted yet, or a dialog holds it: try again next period.
  } finally {
    isSyncing = false
  }
}

export const register: Register = (on, options) => {
  isThumbs = options.thumbnails !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await seedLog($)
    const tiles = !isThumbs ? 'off' : (await canDrawPictures($)) ? 'pixels' : 'half blocks'
    await record($, 'start', `image-open armed: polling the box every ${POLL_MS} ms for [Image #N]; tiles ${tiles}`)
    $.clock.every(POLL_MS, () => {
      void sync($)
    })
    return started
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
    // Tiles on the terminal only: Raster and Image are terminal elements, and the desktop app shows pastes itself.
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e).Raster : undefined
    const Image = e.surface === 'terminal' ? $.ui.resolve(e).Image : undefined
    const sizes = list.map(t => ({ n: t.n, size: t.w !== undefined && t.h !== undefined ? { width: t.w, height: t.h } : null }))
    // Too small a band for one tile: the text row, so every [open] button stays in reach.
    const cells = Raster !== undefined && isThumbs ? fitRow(sizes, e.props.maxRows, e.props.bodyColumns) : []
    const hidden = list.length - cells.length
    const beneath = await next(e)

    return (
      <Box flexDirection="column">
        {Raster !== undefined && Image !== undefined && cells.length > 0 ? (
          <Box key="io-row" flexDirection="row" columnGap={1}>
            {list.slice(0, cells.length).map((t, i) => {
              const { columns, rows } = cells[i]!
              const path = t.path
              const thumb = t.thumb
              const caption = t.failed ?? t.note ?? (path === undefined ? 'reading…' : 'no preview')
              return (
                <Box key={`io-${t.n}`} flexDirection="column" alignItems="center" borderStyle="round" borderDimColor>
                  {thumb !== undefined ? (
                    <Raster
                      key={`io-pic-${t.n}`}
                      columns={columns}
                      rows={rows}
                      cells={blockCells({ width: thumb.width, height: thumb.height, rgb: Uint8Array.fromBase64(thumb.rgb) }, columns, rows)}
                    />
                  ) : t.png !== undefined ? (
                    <Image
                      key={`io-pic-${t.n}`}
                      source={{ file: t.png, format: 'png' }}
                      columns={columns}
                      rows={rows}
                      alt={`[Image #${t.n}]`}
                    />
                  ) : (
                    <Box width={columns} height={rows} alignItems="center" justifyContent="center">
                      <Text dimColor wrap="truncate">
                        {caption}
                      </Text>
                    </Box>
                  )}
                  <Box flexDirection="row" columnGap={1}>
                    <Text dimColor>#{t.n}</Text>
                    {path !== undefined && <Button key={`io-open-${t.n}`} label="open" onPress={() => openFull($, t.n, path)} />}
                  </Box>
                </Box>
              )
            })}
            {hidden > 0 && <Text dimColor>+{hidden}</Text>}
          </Box>
        ) : (
          <Box key="io-row" flexDirection="row" flexWrap="wrap" columnGap={3}>
            {list.map(t => {
              const path = t.path
              const label =
                t.failed !== undefined
                  ? `Image #${t.n}  ${t.failed}`
                  : t.w !== undefined
                    ? `Image #${t.n}  ${t.w}×${t.h}`
                    : path !== undefined
                      ? `Image #${t.n}  ${t.note ?? ''}`.trimEnd()
                      : `Image #${t.n}  reading…`
              return (
                <Box key={`io-${t.n}`} flexDirection="row" columnGap={1}>
                  <Text dimColor>{label}</Text>
                  {path !== undefined && <Button key={`io-open-${t.n}`} label="open" onPress={() => openFull($, t.n, path)} />}
                </Box>
              )
            })}
          </Box>
        )}
        {!isBlank(beneath) && beneath}
      </Box>
    )
  })
}
