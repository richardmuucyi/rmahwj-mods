import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}
const START = Date.parse('2026-10-18T12:00:00')

const TEMP = 'C:\\work\\tmp'
const LOG_FILE = 'C:/work/tmp/image-open/image-open.log'
// Claude Code's own copy of each paste. Windows: <TEMP>/claude/<project>/<session>/images/<n>.png.
const SESSION = 'sess-1'
const IMAGES = `C:/work/tmp/claude/C--work-vault/${SESSION}/images`
// macOS, run as uid 501: /tmp/claude-501/<project>/<session>/images/<n>.png, whatever TMPDIR says.
const MAC_IMAGES = `/tmp/claude-501/-work-vault/${SESSION}/images`
const MAC_LOG_FILE = '/var/folders/xy/T/image-open/image-open.log'

type Platform = 'windows' | 'mac'
const PLATFORM: Record<Platform, { root: string; project: string; images: string; env: Record<string, string> }> = {
  windows: { root: 'C:/work/tmp/claude', project: 'C--work-vault', images: IMAGES, env: { OS: 'Windows_NT', TEMP, TERM_PROGRAM: '' } },
  // Ghostty sets all three of these.
  mac: {
    root: '/tmp/claude-501',
    project: '-work-vault',
    images: MAC_IMAGES,
    env: { TMPDIR: '/var/folders/xy/T/', TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty', GHOSTTY_RESOURCES_DIR: '/Applications/Ghostty.app/Contents/Resources/ghostty' },
  },
}

/** On Windows the engine hands fs hooks backslash paths whatever the plugin wrote: compare them as forward slashes. */
const posix = (p: string): string => p.replace(/\\/g, '/')

/** A real PNG: 8-bit RGB, one stored deflate block, CRCs left zero (the decoder does not check them). */
function png(width: number, height: number, colour: (x: number, y: number) => [number, number, number]): Uint8Array {
  const stride = width * 3 + 1
  const raw = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(colour(x, y), y * stride + 1 + x * 3)
  }
  if (raw.length > 0xffff) throw new Error('test picture too big for one stored block')
  const len = raw.length
  const idat = new Uint8Array(7 + len + 4)
  idat.set([0x78, 0x01, 0x01, len & 0xff, len >> 8, ~len & 0xff, (~len >> 8) & 0xff])
  idat.set(raw, 7)
  const chunk = (name: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length)
    new DataView(out.buffer).setUint32(0, body.length)
    out.set([...name].map(c => c.charCodeAt(0)), 4)
    out.set(body, 8)
    return out
  }
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, width)
  new DataView(ihdr.buffer).setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 2
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0)
  return out
}

// 96 x 32, a different colour almost everywhere: red across, green down. Drawn 48 x 8 cells, 2 x 2 pixels a half block.
const GRADIENT = png(96, 32, (x, y) => [x * 2, y * 8, 200 - x])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33])

type World = {
  box: { text: string }
  /** The environment variables the plugin can read. */
  env: Record<string, string | undefined>
  /** Claude Code's cached pastes, by file name in this session's images folder. */
  pastes: Map<string, Uint8Array>
  /** Files sips wrote, by forward-slash path; what it writes, or undefined for a failing sips. */
  made: Map<string, Uint8Array>
  sipsOutput: Uint8Array | undefined
  /** Set: the engine refuses to launch explorer.exe. */
  explorerDeny?: string
  /** Text files the plugin reads and writes (the log), by forward-slash path. */
  files: Map<string, string>
  /** Byte reads of cached pastes, by forward-slash path. */
  byteReads: string[]
  runs: string[][]
  toasts: string[]
  logs: string[]
}

/** The engine beneath the plugin: a prompt box the test types into, Claude Code's paste cache, a log in memory. */
function bottom(on: On, platform: Platform = 'windows'): World {
  const { root, project, images } = PLATFORM[platform]
  const w: World = {
    box: { text: '' },
    env: { ...PLATFORM[platform].env },
    pastes: new Map(),
    made: new Map(),
    sipsOutput: undefined,
    files: new Map(),
    byteReads: [],
    runs: [],
    toasts: [],
    logs: [],
  }
  const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })
  // The kit runs on this Windows machine and resolves a Mac path like /tmp/x to C:\tmp\x: drop the drive letter again.
  const norm = (p: string) => (platform === 'mac' ? posix(p).replace(/^[A-Za-z]:/, '') : posix(p))
  const paste = (p: string) => (p.startsWith(`${images}/`) ? w.pastes.get(p.slice(images.length + 1)) : undefined)
  on('env.get', (_$, e) => ({ value: w.env[e.name] || undefined }))
  on('session.id', () => ({ value: SESSION }))
  on('fs.list', (_$, e) => {
    const p = norm(e.path)
    // Another project's folder and a stray file sit beside the one holding this session.
    if (p === root) return { value: [entry('C--other', 'dir'), entry('notes.txt', 'file'), entry(project, 'dir')] }
    if (p === images) return { value: [...w.pastes.keys()].map(name => entry(name, 'file')) }
    return { deny: 'ENOENT' }
  })
  on('fs.exists', (_$, e) => {
    const p = norm(e.path)
    return { value: (p === images && w.pastes.size > 0) || paste(p) !== undefined || w.made.has(p) }
  })
  on('fs.read', (_$, e) => {
    const p = norm(e.path)
    if (e.as === 'bytes') {
      const bytes = paste(p) ?? w.made.get(p)
      if (bytes === undefined) return { deny: 'ENOENT' }
      w.byteReads.push(p)
      return { value: { base64: bytes.toBase64() } }
    }
    const text = w.files.get(p)
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('prompt.read', () => ({ value: { text: w.box.text, cursor: w.box.text.length } }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    w.runs.push(argv)
    const done = (exitCode: number, stdout = '') => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (argv[0] === 'id') return done(0, '501\n')
    if (argv[0] === 'sips') {
      if (w.sipsOutput === undefined) return done(1)
      w.made.set(posix(argv[argv.indexOf('--out') + 1]!), w.sipsOutput)
      return done(0)
    }
    if (w.explorerDeny) return { deny: w.explorerDeny }
    // Windows hands the file to the viewer and explorer.exe usually exits 1 anyway; macOS's open exits 0.
    return done(argv[0] === 'explorer.exe' ? 1 : 0)
  })
  on('fs.write', (_$, e) => {
    w.files.set(norm(e.path), e.text)
    if (e.path.endsWith('image-open.log')) w.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="engine-own">
        <Text>engine</Text>
      </Box>
    )
  })
  return w
}

type Band = typeof BAND

/**
 * What the band draws for the given image numbers: is there an [open] button, what does each entry say, and the
 * picture (a Raster) of each, if any. `press` presses that key (an [open] button) before the band goes away.
 */
async function strip($: Engine, surface: 'terminal' | 'desktop', ns: number[] = [], press?: string, props: Band = BAND) {
  const band = await $.ui.mount({ plugin: 'image-open', surface, component: 'AbovePrompt', props })
  const open: Record<number, boolean> = {}
  const text: Record<number, string> = {}
  const pic: Record<number, { columns: number; rows: number; cells: string } | undefined> = {}
  // An Image: real pixels, the terminal reading the file itself.
  const image: Record<number, { columns: number; rows: number; source: { file: string; format: string } } | undefined> = {}
  for (const n of ns) {
    open[n] = (await band.find({ key: `io-open-${n}` })) !== undefined
    text[n] = (await band.find({ key: `io-${n}` }))?.text.replace(/\s+/g, ' ').trim() ?? ''
    const node = await band.find({ key: `io-pic-${n}` })
    if (node?.type === 'Raster') pic[n] = node.props as { columns: number; rows: number; cells: string }
    if (node?.type === 'Image') image[n] = node.props as { columns: number; rows: number; source: { file: string; format: string } }
  }
  const out = {
    open,
    text,
    pic,
    image,
    row: (await band.find({ key: 'io-row' })) !== undefined,
    own: (await band.find({ key: 'engine-own' })) !== undefined,
    hasPicture: (await band.find({ type: 'Raster' })) !== undefined || (await band.find({ type: 'Image' })) !== undefined,
  }
  if (press !== undefined) await band.press({ key: press })
  await band.unmount()
  return out
}

/** The cells of a Raster as [glyph, foreground, background] triplets. */
function cellsOf(cells: string): number[][] {
  const bytes = Uint8Array.fromBase64(cells)
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4)
  const out: number[][] = []
  for (let i = 0; i < words.length; i += 3) out.push([words[i]!, words[i + 1]!, words[i + 2]!])
  return out
}

/** Let the 200 ms poll run `polls` times. */
async function settle(clock: { advance: (ms: number) => Promise<void> }, polls = 5): Promise<void> {
  for (let i = 0; i < polls; i++) await clock.advance(200)
}

const lastLog = (w: World) => w.logs[w.logs.length - 1] ?? ''

test("a pasted image gets a tile: Claude Code's own copy drawn in full-colour half blocks, and an [open] button", async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('2.png', GRADIENT)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  // Nothing in the box: nothing drawn, the engine's own band untouched.
  let s = await strip($, 'terminal')
  expect(s.row).toBe(false)
  expect(s.own).toBe(true)

  w.box.text = '[Image #2] what is this'
  await settle(clock)
  s = await strip($, 'terminal', [2])
  expect(s.open[2]).toBe(true)
  expect(s.text[2]).toContain('#2')
  expect(s.own).toBe(true)
  // A 3:1 picture keeps its shape: 48 columns by 8 rows.
  const pic = s.pic[2]!
  expect([pic.columns, pic.rows]).toEqual([48, 8])
  const cells = cellsOf(pic.cells)
  expect(cells.length).toBe(48 * 8)
  expect(cells.every(c => c[0] === 0x2580)).toBe(true)
  // Every half block keeps its own averaged colour: the old image-thumbs cut a picture to 32 colours and snapped them.
  const colours = new Set(cells.flatMap(c => [c[1], c[2]]))
  expect(colours.size).toBeGreaterThan(300)
  // The top-left cell's upper half is the average of the 2 x 2 pixels under it: (1, 4, 200), not a multiple of 17.
  expect(cells[0]![1]).toBe((1 << 16) | (4 << 8) | 200)

  // No PowerShell: the file is Claude Code's, read once.
  expect(w.runs).toEqual([])
  expect(w.byteReads).toEqual([`${IMAGES}/2.png`])
  await settle(clock)
  expect(w.byteReads.length).toBe(1)
  expect(lastLog(w)).toContain('armed: polling the box every 200 ms')
  expect(lastLog(w)).toContain('[Image #2] in the box')
  expect(lastLog(w)).toMatch(/found +#2 96x32, thumb 96x32, \d+ ms, C:\/work\/tmp\/claude\/C--work-vault\/sess-1\/images\/2\.png/)

  // The token is deleted: the tile goes with it.
  w.box.text = 'what is this'
  await settle(clock)
  s = await strip($, 'terminal')
  expect(s.row).toBe(false)
  expect(lastLog(w)).toContain('[Image #2] left the box')
})

test("[open] hands Claude Code's file to Windows with backslashes, and says so in the log", async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('8.png', GRADIENT)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #8]'
  await settle(clock)
  expect(w.runs).toEqual([])
  await strip($, 'terminal', [8], 'io-open-8')

  expect(w.runs).toEqual([['explorer.exe', 'C:\\work\\tmp\\claude\\C--work-vault\\sess-1\\images\\8.png']])
  // explorer.exe exits 1 when it worked: that is not an error.
  const last = lastLog(w).trim().split('\n').pop() ?? ''
  expect(last).toMatch(/^\S+ open +#8 /)
  expect(last).toContain('(explorer exit 1')
  expect(w.toasts).toEqual([])
})

test('if Windows refuses to open it: a toast and a log line, not a crash', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('9.png', GRADIENT)
  w.explorerDeny = 'blocked'
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #9]'
  await settle(clock)
  await strip($, 'terminal', [9], 'io-open-9')

  expect(w.toasts.some(t => t.includes('could not open [Image #9]'))).toBe(true)
  expect(lastLog(w)).toContain('open #9')
})

test('two tokens: two tiles side by side, each [open] opening its own file', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('3.png', GRADIENT)
  w.pastes.set('4.png', png(10, 40, () => [0, 0, 255]))
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #3] [Image #4]'
  await settle(clock)
  const s = await strip($, 'terminal', [3, 4], 'io-open-4')
  expect(s.open[3]).toBe(true)
  expect(s.open[4]).toBe(true)
  // A tall picture stays tall: 8 rows, 4 columns (10 x 40 at two pixels a cell, cells twice as tall as wide).
  expect([s.pic[4]!.columns, s.pic[4]!.rows]).toEqual([4, 8])
  expect(cellsOf(s.pic[4]!.cells).every(c => c[1] === 0x0000ff && c[2] === 0x0000ff)).toBe(true)
  expect(w.runs).toEqual([['explorer.exe', 'C:\\work\\tmp\\claude\\C--work-vault\\sess-1\\images\\4.png']])
})

test('a short band shrinks the tile; a band too small for any tile falls back to the text row, button kept', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('2.png', GRADIENT)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })
  w.box.text = '[Image #2]'
  await settle(clock)

  // Seven rows: three go to the border and label, so the picture gets four.
  let s = await strip($, 'terminal', [2], undefined, { ...BAND, maxRows: 7 })
  expect(s.pic[2]!.rows).toBe(4)
  // Three rows hold no tile at all: the label and the button, as in 0.1.
  s = await strip($, 'terminal', [2], undefined, { ...BAND, maxRows: 3 })
  expect(s.hasPicture).toBe(false)
  expect(s.open[2]).toBe(true)
  expect(s.text[2]).toBe('Image #2 96×32open')
})

test('the file may land after the token: the tile says reading…, then draws the picture', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #5]'
  await settle(clock, 3)
  let s = await strip($, 'terminal', [5])
  expect(s.text[5]).toContain('reading…')
  expect(s.open[5]).toBe(false)

  w.pastes.set('5.png', GRADIENT)
  await settle(clock, 2)
  s = await strip($, 'terminal', [5])
  expect(s.pic[5]).toBeDefined()
  expect(s.open[5]).toBe(true)
  expect(w.toasts).toEqual([])
})

test('a PNG still being written (no whole header yet) is waited for, not judged', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('12.png', GRADIENT.subarray(0, 20))
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #12]'
  await settle(clock, 3)
  let s = await strip($, 'terminal', [12])
  expect(s.text[12]).toContain('reading…')

  w.pastes.set('12.png', GRADIENT)
  await settle(clock, 2)
  s = await strip($, 'terminal', [12])
  expect(s.pic[12]).toBeDefined()
})

test('no file after about 3 s: the tile says no file, a toast, no [open] button, and the polls stop looking', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #6]'
  await settle(clock, 20)
  const s = await strip($, 'terminal', [6])
  expect(s.open[6]).toBe(false)
  expect(s.text[6]).toContain('no file')
  expect(w.toasts.filter(t => t.includes('[Image #6]')).length).toBe(1)
  expect(lastLog(w)).toMatch(/failed +#6 no file for it in C:\/work\/tmp\/claude \(no folder for this session\) after 15 looks/)
  // A file arriving later is not looked for again while the token stays.
  w.pastes.set('6.png', GRADIENT)
  await settle(clock, 5)
  expect(w.byteReads).toEqual([])
})

test('a JPEG paste: [open] works, the tile says no preview and nothing is decoded', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('7.jpg', JPEG)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #7]'
  await settle(clock)
  const s = await strip($, 'terminal', [7], 'io-open-7')
  expect(s.text[7]).toContain('no preview')
  expect(s.pic[7]).toBeUndefined()
  expect(w.byteReads).toEqual([])
  expect(w.runs).toEqual([['explorer.exe', 'C:\\work\\tmp\\claude\\C--work-vault\\sess-1\\images\\7.jpg']])
})

test('a file under a .png name that is not a PNG: [open] kept, no preview, read once', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('11.png', JPEG)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #11]'
  await settle(clock, 10)
  const s = await strip($, 'terminal', [11])
  expect(s.open[11]).toBe(true)
  expect(s.text[11]).toContain('no preview')
  expect(w.byteReads.length).toBe(1)
})

test('thumbnails off: the label and the button only, nothing decoded into a picture', { options: { thumbnails: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('2.png', GRADIENT)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #2]'
  await settle(clock)
  const s = await strip($, 'terminal', [2])
  expect(s.hasPicture).toBe(false)
  expect(s.open[2]).toBe(true)
  expect(s.text[2]).toBe('Image #2 96×32open')
  expect(lastLog(w)).toContain('thumbnails off')
})

test('the desktop surface gets the label and the button, never a Raster', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('7.png', GRADIENT)
  await $.session.start({ cwd: '/home/me/vault', surface: 'desktop', isInteractive: true })

  w.box.text = '[Image #7]'
  await settle(clock)
  const s = await strip($, 'desktop', [7])
  expect(s.open[7]).toBe(true)
  expect(s.hasPicture).toBe(false)
  expect(s.text[7]).toContain('#7')
})

test('the log goes to the temp folder, not to a session folder', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.pastes.set('2.png', GRADIENT)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #2]'
  await settle(clock)
  const logs = [...w.files.keys()].filter(p => p.endsWith('.log'))
  expect(logs).toEqual([LOG_FILE])
  expect(w.files.get(LOG_FILE)).toContain('[Image #2] in the box')
})

test('an earlier session lines are kept: the log goes on from them', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.files.set(LOG_FILE, '19:00:00.000 start      earlier session\n19:00:05.000 token      [Image #1] in the box\n')
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #2]'
  await settle(clock)
  const written = (w.files.get(LOG_FILE) ?? '').trim().split('\n')
  expect(written.slice(0, 2)).toEqual([
    '19:00:00.000 start      earlier session',
    '19:00:05.000 token      [Image #1] in the box',
  ])
  expect(written.some(l => l.includes('armed: polling the box'))).toBe(true)
  expect(written.some(l => l.includes('[Image #2] in the box'))).toBe(true)
})

test('the log is capped: only the last 300 lines of an old log are carried over', async ($, on) => {
  mock.clock(on, { now: START })
  const w = bottom(on)
  w.files.set(LOG_FILE, Array.from({ length: 450 }, (_, i) => `old line ${i}`).join('\n') + '\n')
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  const written = (w.files.get(LOG_FILE) ?? '').trim().split('\n')
  expect(written.length).toBe(300)
  // The newest old lines survive and the start line is at the end.
  expect(written[0]).toBe('old line 151')
  expect(written[written.length - 1]).toContain('armed: polling the box')
})

test('with no temp folder at all, the log goes beside the mod', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.env.TEMP = undefined
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #2]'
  await settle(clock)
  const logs = [...w.files.keys()].filter(p => p.endsWith('.log'))
  expect(logs.length).toBe(1)
  expect(logs[0]).toMatch(/\/image-open\.log$/)
  expect(logs[0]).not.toContain('/tmp/')
})

// macOS in Ghostty: Claude Code draws Image as real pixels there.

test('Ghostty on a Mac: the tile is real pixels, the terminal drawing Claude Code\'s own file', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on, 'mac')
  w.pastes.set('2.png', GRADIENT)
  await $.session.start({ cwd: '/work/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #2] what is this'
  await settle(clock)
  const s = await strip($, 'terminal', [2])
  expect(s.image[2]).toMatchObject({ source: { file: `${MAC_IMAGES}/2.png`, format: 'png' }, columns: 48, rows: 8, alt: '[Image #2]' })
  expect(s.pic[2]).toBeUndefined()
  expect(s.open[2]).toBe(true)
  // The folder is /tmp/claude-<uid>: one id -u, and nothing else run until [open] is pressed.
  expect(w.runs).toEqual([['id', '-u']])
  expect(lastLog(w)).toContain('tiles pixels')
  expect(lastLog(w)).toMatch(/found +#2 96x32, drawn as pixels, \d+ ms, \/tmp\/claude-501\/-work-vault\/sess-1\/images\/2\.png/)
})

test('[open] on a Mac runs open on the file, and the log goes to TMPDIR', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on, 'mac')
  w.pastes.set('8.png', GRADIENT)
  await $.session.start({ cwd: '/work/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #8]'
  await settle(clock)
  await strip($, 'terminal', [8], 'io-open-8')
  expect(w.runs.filter(r => r[0] !== 'id')).toEqual([['open', `${MAC_IMAGES}/8.png`]])
  expect(w.files.get(MAC_LOG_FILE)).toContain(`open       #8 ${MAC_IMAGES}/8.png (open exit 0`)
  expect([...w.files.keys()].filter(p => p.endsWith('.log'))).toEqual([MAC_LOG_FILE])
})

test('a JPEG paste on a Mac is converted once with sips, the copy drawn, the original opened', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on, 'mac')
  w.pastes.set('7.jpg', JPEG)
  w.sipsOutput = png(40, 20, () => [255, 128, 0])
  await $.session.start({ cwd: '/work/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #7]'
  await settle(clock, 10)
  const copy = `/tmp/claude-501/-work-vault/${SESSION}/image-open-7.png`
  const s = await strip($, 'terminal', [7], 'io-open-7')
  // The copy's shape: 40 x 20 is 2:1, so 8 rows by 32 columns.
  expect(s.image[7]).toMatchObject({ source: { file: copy, format: 'png' }, columns: 32, rows: 8 })
  const sips = w.runs.filter(r => r[0] === 'sips')
  expect(sips).toEqual([['sips', '-s', 'format', 'png', '-Z', '800', `${MAC_IMAGES}/7.jpg`, '--out', copy]])
  expect(w.runs.filter(r => r[0] === 'open')).toEqual([['open', `${MAC_IMAGES}/7.jpg`]])
})

test('sips fails on a Mac: no preview, [open] kept, sips not run again', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on, 'mac')
  w.pastes.set('7.heic', JPEG)
  await $.session.start({ cwd: '/work/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #7]'
  await settle(clock, 10)
  const s = await strip($, 'terminal', [7])
  expect(s.text[7]).toContain('no preview')
  expect(s.open[7]).toBe(true)
  expect(w.runs.filter(r => r[0] === 'sips').length).toBe(1)
})

/** A Mac session whose terminal is changed by `env`: the tile it draws for a 96 x 32 paste. */
async function macTile($: Engine, on: On, env: Record<string, string | undefined>) {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on, 'mac')
  Object.assign(w.env, env)
  w.pastes.set('2.png', GRADIENT)
  await $.session.start({ cwd: '/work/vault', surface: 'terminal', isInteractive: true })
  w.box.text = '[Image #2]'
  await settle(clock)
  return strip($, 'terminal', [2])
}

test('Terminal.app on a Mac: half blocks, as on Windows', async ($, on) => {
  const s = await macTile($, on, { TERM: 'xterm-256color', TERM_PROGRAM: 'Apple_Terminal', GHOSTTY_RESOURCES_DIR: undefined })
  expect(s.image[2]).toBeUndefined()
  expect([s.pic[2]?.columns, s.pic[2]?.rows]).toEqual([48, 8])
})

test('Ghostty inside tmux: half blocks (Claude Code turns pixels off there)', async ($, on) => {
  const s = await macTile($, on, { TMUX: '/private/tmp/tmux-501/default,1,0' })
  expect(s.image[2]).toBeUndefined()
  expect(s.pic[2]).toBeDefined()
})

test('IMAGE_OPEN_RENDERER=blocks forces half blocks in Ghostty', async ($, on) => {
  const s = await macTile($, on, { IMAGE_OPEN_RENDERER: 'blocks' })
  expect(s.image[2]).toBeUndefined()
  expect(s.pic[2]).toBeDefined()
})
