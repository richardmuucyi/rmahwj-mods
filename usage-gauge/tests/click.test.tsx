import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// The model and effort chips are buttons: a click types /model or /effort into the prompt box, and you press Enter.
// The box is read at the click. A box that holds words of yours, or that cannot be read, is left alone; text a chip
// typed is not yours, so the other chip may replace it.

const HINT = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const START = Date.parse('2026-10-30T10:00:00')

/** The prompt box: what it holds, whether it can be read and whether it takes a fill, and every fill asked of it. */
type Box = { text: string; readable: boolean; fillOk: boolean; fills: { text: string; mode: unknown }[] }

function engine(on: On, box: Box) {
  mock.clock(on, { now: START })
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-own" />
  })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('env.get', () => ({ value: undefined }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('prompt.read', () => (box.readable ? { value: { text: box.text, cursor: box.text.length } } : { deny: 'no prompt box on this surface' }))
  on('prompt.fill', (_$, e) => {
    box.fills.push({ text: e.text, mode: e.mode })
    if (box.fillOk) box.text = e.text
    return { ...e, isFilled: box.fillOk }
  })
}

async function click($: Engine, key: 'ug-model' | 'ug-effort'): Promise<void> {
  const band = await $.ui.mount({ plugin: 'usage-gauge', surface: 'terminal', component: 'PromptHint', props: HINT })
  await band.press({ key })
  await band.unmount()
}

async function started($: Engine, on: On, o: Partial<Box> = {}): Promise<Box> {
  const box: Box = { text: '', readable: true, fillOk: true, fills: [], ...o }
  engine(on, box)
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  return box
}

test('an empty box: the model chip types /model, replacing nothing', async ($, on) => {
  const box = await started($, on)
  await click($, 'ug-model')
  expect(box.fills).toEqual([{ text: '/model', mode: 'replace' }])
})

test('an empty box: the effort chip types /effort', async ($, on) => {
  const box = await started($, on)
  await click($, 'ug-effort')
  expect(box.fills).toEqual([{ text: '/effort', mode: 'replace' }])
})

test('the box holds words of yours: neither chip types anything', async ($, on) => {
  const box = await started($, on)
  box.text = 'fix the cache timer'
  await click($, 'ug-model')
  await click($, 'ug-effort')
  expect(box.fills).toEqual([])
  expect(box.text).toBe('fix the cache timer')
})

test('a draft already in the box when the session starts (a resume) is yours too', async ($, on) => {
  const box = await started($, on, { text: 'half a thought from yesterday' })
  await click($, 'ug-model')
  expect(box.fills).toEqual([])
})

test('a box that cannot be read: the chips type nothing', async ($, on) => {
  const box = await started($, on, { readable: false })
  await click($, 'ug-model')
  expect(box.fills).toEqual([])
})

test('spaces alone are not words: the chip still types', async ($, on) => {
  const box = await started($, on, { text: '   ' })
  await click($, 'ug-model')
  expect(box.fills).toEqual([{ text: '/model', mode: 'replace' }])
})

test('text a chip typed is not yours: the other chip replaces it', async ($, on) => {
  const box = await started($, on)
  await click($, 'ug-model')
  await click($, 'ug-effort')
  expect(box.fills.map(f => f.text)).toEqual(['/model', '/effort'])
})

test('you add to what a chip typed: it is yours now, and the chips leave it', async ($, on) => {
  const box = await started($, on)
  await click($, 'ug-model')
  box.text = '/model sonnet'
  await click($, 'ug-effort')
  expect(box.fills.map(f => f.text)).toEqual(['/model'])
})

test('after a prompt you send, "/model" typed by hand is yours', async ($, on) => {
  const box = await started($, on)
  await click($, 'ug-model')
  await $.prompt.submit({ text: '/model', origin: { kind: 'composer' }, wait: false })
  box.text = '/model'
  await click($, 'ug-effort')
  expect(box.fills.map(f => f.text)).toEqual(['/model'])
})

test('the box refuses the fill: what it holds is not counted as a chip\'s, and the next click tries again', async ($, on) => {
  const box = await started($, on, { fillOk: false })
  await click($, 'ug-model')
  await click($, 'ug-model')
  expect(box.fills.map(f => f.text)).toEqual(['/model', '/model'])
})
