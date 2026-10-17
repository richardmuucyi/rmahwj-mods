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
const START = Date.parse('2026-10-15T12:00:00')

type World = {
  box: { text: string }
  /** What the clipboard read does: save a picture, find nothing readable, or PowerShell fails. */
  clipboard: 'picture' | 'none' | 'fail'
  picture: { w: number; h: number }
  /** False: the picture was read but the file could not be written (a NOSAVE line). */
  saves: boolean
  /** Set: the engine refuses to launch explorer.exe. */
  explorerDeny?: string
  /** The Windows temp folder, as TEMP reports it (backslashes); undefined: neither TEMP nor TMP is set. */
  temp: string | undefined
  /** The files the plugin reads and writes, by the path it used. */
  files: Map<string, string>
  runs: string[][]
  toasts: string[]
  logs: string[]
}

const TEMP = 'C:\\work\\tmp'
const LOG_FILE = 'C:/work/tmp/image-open/image-open.log'

/** On Windows the engine hands fs hooks backslash paths whatever the plugin wrote: compare them as forward slashes. */
const posix = (p: string): string => p.replace(/\\/g, '/')

/** The engine beneath the plugin: a prompt box the test types into, a clipboard it controls, a log in memory. */
function bottom(on: On): World {
  const w: World = {
    box: { text: '' },
    clipboard: 'picture',
    picture: { w: 1600, h: 900 },
    saves: true,
    temp: TEMP,
    files: new Map(),
    runs: [],
    toasts: [],
    logs: [],
  }
  on('env.get', (_$, e) => ({ value: e.name === 'TEMP' ? w.temp : undefined }))
  on('fs.read', (_$, e) => {
    const text = w.files.get(posix(e.path))
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('prompt.read', () => ({ value: { text: w.box.text, cursor: w.box.text.length } }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    w.runs.push(argv)
    const done = (stdout: string, exitCode = 0, stderr = '') => ({
      value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
    })
    // Windows hands the file to the viewer and explorer.exe usually exits 1 anyway.
    if (argv[0] === 'explorer.exe') return w.explorerDeny ? { deny: w.explorerDeny } : done('', 1)
    if (w.clipboard === 'none') return done('NOIMAGE\n')
    if (w.clipboard === 'fail') return done('', 1, 'boom')
    if (!w.saves) return done('NOSAVE There is not enough space on the disk.\n')
    const name = argv[argv.indexOf('-SaveName') + 1] ?? 'unnamed'
    return done(`OK ${w.picture.w} ${w.picture.h}\nSAVED C:\\Temp\\image-open\\${name}.png\n`)
  })
  on('fs.write', (_$, e) => {
    w.files.set(posix(e.path), e.text)
    if (e.path.endsWith('image-open.log')) w.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('prompt.edit', (_$, e) => ({ text: e.text, cursor: e.cursor }))
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

/**
 * What the band draws for the given image numbers: is there an [open] button, what does the label say. `press` presses
 * that key (an [open] button) before the band goes away. `hasPicture` says whether any thumbnail (a Raster) was drawn.
 */
async function strip($: Engine, surface: 'terminal' | 'desktop', ns: number[] = [], press?: string) {
  const band = await $.ui.mount({ plugin: 'image-open', surface, component: 'AbovePrompt', props: BAND })
  const open: Record<number, boolean> = {}
  const text: Record<number, string> = {}
  for (const n of ns) {
    open[n] = (await band.find({ key: `io-open-${n}` })) !== undefined
    text[n] = (await band.find({ key: `io-${n}` }))?.text.replace(/\s+/g, ' ').trim() ?? ''
  }
  const out = {
    open,
    text,
    row: (await band.find({ key: 'io-row' })) !== undefined,
    own: (await band.find({ key: 'engine-own' })) !== undefined,
    hasPicture: (await band.find({ type: 'Raster' })) !== undefined || (await band.find({ type: 'Image' })) !== undefined,
  }
  if (press !== undefined) await band.press({ key: press })
  await band.unmount()
  return out
}

/** Let the 400 ms poll run and the queued clipboard read finish. */
async function settle(clock: { advance: (ms: number) => Promise<void> }): Promise<void> {
  for (let i = 0; i < 6; i++) await clock.advance(400)
}

test('a new [Image #N] token gets an [open] button and a label; both go when the token does', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  // Nothing in the box: nothing drawn, the engine own band untouched.
  let s = await strip($, 'terminal')
  expect(s.row).toBe(false)
  expect(s.own).toBe(true)

  // Alt+V: the token appears (session-wide number, here #2) and the clipboard is read once.
  w.box.text = '[Image #2] what is this'
  await settle(clock)
  expect(w.runs.length).toBe(1)
  const argv = w.runs[0]!
  expect(argv[0]).toBe('powershell.exe')
  expect(argv.join(' ')).toContain('scripts/clip-save.ps1')
  expect(argv[argv.indexOf('-SaveName') + 1]).toMatch(/^image-2-\d+$/)
  s = await strip($, 'terminal', [2])
  expect(s.row).toBe(true)
  expect(s.open[2]).toBe(true)
  // The row is the label, then the button (whose own label, open, is part of the row text).
  expect(s.text[2]).toBe('Image #2 1600×900open')
  expect(s.own).toBe(true)
  // No second read while the token stays.
  await settle(clock)
  expect(w.runs.length).toBe(1)

  // The log says what happened, for checking.
  const log = w.logs[w.logs.length - 1] ?? ''
  expect(log).toContain('armed: polling the box')
  expect(log).toContain('[Image #2] in the box')
  expect(log).toMatch(/#2 1600x900, \d+ ms, saved C:\\Temp\\image-open\\image-2-\d+\.png/)

  // The token is deleted: the button goes with it.
  w.box.text = 'what is this'
  await settle(clock)
  s = await strip($, 'terminal')
  expect(s.row).toBe(false)
  expect(w.logs[w.logs.length - 1]).toContain('[Image #2] left the box')
})

test('there is no thumbnail: the band draws text and a button, never a picture', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #2] [Image #3]'
  await settle(clock)
  const s = await strip($, 'terminal', [2, 3])
  expect(s.open[2]).toBe(true)
  expect(s.open[3]).toBe(true)
  expect(s.hasPicture).toBe(false)
})

test('[open] hands the full-size copy to Windows and says so in the log', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #8]'
  await settle(clock)
  const saved = `C:\\Temp\\image-open\\${w.runs[0]![w.runs[0]!.indexOf('-SaveName') + 1]}.png`

  // Nothing is opened until the button is pressed.
  expect(w.runs.filter(r => r[0] === 'explorer.exe').length).toBe(0)
  await strip($, 'terminal', [8], 'io-open-8')
  await settle(clock)

  const opened = w.runs.filter(r => r[0] === 'explorer.exe')
  expect(opened).toEqual([['explorer.exe', saved]])
  // explorer.exe exits 1 when it worked: that is not an error.
  const last = (w.logs[w.logs.length - 1] ?? '').trim().split('\n').pop() ?? ''
  expect(last).toMatch(/^\S+ open +#8 /)
  expect(last).toContain(`${saved} (explorer exit 1`)
  expect(w.toasts).toEqual([])
})

test('if Windows refuses to open it: a toast and a log line, not a crash', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.explorerDeny = 'blocked'
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #9]'
  await settle(clock)
  await strip($, 'terminal', [9], 'io-open-9')
  await settle(clock)

  expect(w.toasts.some(t => t.includes('could not open [Image #9]'))).toBe(true)
  expect(w.logs[w.logs.length - 1]).toContain('open #9')
})

test('two tokens in the box: two buttons, read one after the other, each opening its own file', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #3] [Image #4]'
  await settle(clock)
  expect(w.runs.length).toBe(2)
  const s = await strip($, 'terminal', [3, 4], 'io-open-4')
  expect(s.open[3]).toBe(true)
  expect(s.open[4]).toBe(true)
  await settle(clock)
  const opened = w.runs.filter(r => r[0] === 'explorer.exe')
  expect(opened.length).toBe(1)
  expect(opened[0]![1]).toMatch(/image-4-\d+\.png$/)
})

test('nothing readable on the clipboard: a label and a toast, no [open] button', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.clipboard = 'none'
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #5]'
  await settle(clock)
  // Tried twice: the engine can put the token in the box a moment before the clipboard is ready.
  expect(w.runs.length).toBe(2)
  const s = await strip($, 'terminal', [5])
  expect(s.open[5]).toBe(false)
  expect(s.text[5]).toBe('Image #5 no picture')
  expect(w.toasts.some(t => t.includes('[Image #5]'))).toBe(true)
  expect(w.logs[w.logs.length - 1]).toContain('no picture on the clipboard')
})

test('a PowerShell failure is reported, not thrown', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.clipboard = 'fail'
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #6]'
  await settle(clock)
  const s = await strip($, 'terminal', [6])
  expect(s.open[6]).toBe(false)
  expect(s.text[6]).toBe('Image #6 could not read')
  expect(w.logs[w.logs.length - 1]).toContain('powershell exit 1: boom')
})

test('the picture was read but could not be saved: no [open] button, and the reason is logged', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  w.saves = false
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #10]'
  await settle(clock)
  const s = await strip($, 'terminal', [10])
  expect(s.open[10]).toBe(false)
  expect(s.text[10]).toBe('Image #10 could not save')
  expect(w.logs[w.logs.length - 1]).toContain('NOSAVE There is not enough space on the disk.')
})

test('the desktop surface gets the same button', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  await $.session.start({ cwd: '/home/me/vault', surface: 'desktop', isInteractive: true })

  w.box.text = '[Image #7]'
  await settle(clock)
  const s = await strip($, 'desktop', [7])
  expect(s.open[7]).toBe(true)
  expect(s.text[7]).toContain('#7')
})

test('the log goes to the temp folder, beside the saved pictures, not to a session folder', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = bottom(on)
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #2]'
  await settle(clock)
  // Backslashes of TEMP become forward slashes; the folder is the one the pictures are saved in.
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
  const clock = mock.clock(on, { now: START })
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
  w.temp = undefined
  await $.session.start({ cwd: '/home/me/vault', surface: 'terminal', isInteractive: true })

  w.box.text = '[Image #2]'
  await settle(clock)
  const logs = [...w.files.keys()].filter(p => p.endsWith('.log'))
  expect(logs.length).toBe(1)
  expect(logs[0]).toMatch(/\/image-open\.log$/)
  expect(logs[0]).not.toContain('/Temp/')
})
