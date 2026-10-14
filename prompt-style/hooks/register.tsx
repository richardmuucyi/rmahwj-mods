import type { EngineInterface, Register, RenderElement } from 'claude-code'

// Your own prompts and slash commands, drawn in the style and colour you pick in
// /config. Only the drawing changes: what Claude received is untouched, so this
// costs no tokens.

type Look = { bg?: string; mark: string; ink: string }
type Hue = { emoji: string; light: Look; dark: Look; outline: Look }

/** Eight colours, each in every style. */
const HUES: Record<string, Hue> = {
  yellow: { emoji: '🟨', light: { bg: '#fef3c7', mark: '#b45309', ink: '#422006' }, dark: { bg: '#3d3416', mark: '#facc15', ink: '#fff8db' }, outline: { mark: '#facc15', ink: '#fde68a' } },
  green: { emoji: '🟩', light: { bg: '#d1fae5', mark: '#047857', ink: '#064e3b' }, dark: { bg: '#13322a', mark: '#34d399', ink: '#ecfdf5' }, outline: { mark: '#4ade80', ink: '#dcfce7' } },
  blue: { emoji: '🟦', light: { bg: '#dbeafe', mark: '#1d4ed8', ink: '#172554' }, dark: { bg: '#1d2b44', mark: '#60a5fa', ink: '#f1f5ff' }, outline: { mark: '#60a5fa', ink: '#dbeafe' } },
  purple: { emoji: '🟪', light: { bg: '#ede9fe', mark: '#6d28d9', ink: '#2e1065' }, dark: { bg: '#2e1a47', mark: '#c084fc', ink: '#faf5ff' }, outline: { mark: '#c084fc', ink: '#f3e8ff' } },
  orange: { emoji: '🟧', light: { bg: '#ffedd5', mark: '#c2410c', ink: '#431407' }, dark: { bg: '#3a2416', mark: '#fb923c', ink: '#fff7ed' }, outline: { mark: '#fb923c', ink: '#ffedd5' } },
  red: { emoji: '🟥', light: { bg: '#ffe4e6', mark: '#be123c', ink: '#4c0519' }, dark: { bg: '#3b1420', mark: '#fb7185', ink: '#fff1f2' }, outline: { mark: '#fb7185', ink: '#ffe4e6' } },
  grey: { emoji: '⬜', light: { bg: '#f1f5f9', mark: '#475569', ink: '#0f172a' }, dark: { bg: '#26292f', mark: '#e5e7eb', ink: '#ffffff' }, outline: { mark: '#9ca3af', ink: '#f3f4f6' } },
  brown: { emoji: '🟫', light: { bg: '#f5e6d3', mark: '#92400e', ink: '#3b1d0a' }, dark: { bg: '#33261a', mark: '#d6a76c', ink: '#fbf3e6' }, outline: { mark: '#d6a76c', ink: '#f5e6d3' } },
}
const STYLES = ['light row', 'dark row', 'outline'] as const
type Style = (typeof STYLES)[number]

function lookOf(style: Style, hue: Hue): Look {
  return style === 'dark row' ? hue.dark : style === 'outline' ? hue.outline : hue.light
}

/** "🟨 yellow" → "yellow". */
const hueName = (v: unknown) => String(v ?? '').replace(/^[^a-z]+/i, '').trim().toLowerCase()

/** Splits a prompt into rows of at most `width` characters, keeping its own line breaks. */
function wrap(text: string, width: number): string[] {
  const out: string[] = []
  for (const line of text.replace(/\t/g, '  ').split('\n')) {
    if (line.length <= width) {
      out.push(line)
      continue
    }
    let rest = line
    while (rest.length > width) {
      const cut = rest.lastIndexOf(' ', width)
      const at = cut > width * 0.5 ? cut : width
      out.push(rest.slice(0, at))
      rest = rest.slice(at).replace(/^ /, '')
    }
    out.push(rest)
  }
  return out
}

type Kit = { Box: (p: any) => RenderElement; Text: (p: any) => RenderElement }

/** One drawn row in a look: a full-width tinted row, or an outline bar. */
function row(ui: Kit, key: string, look: Look, text: string, first: boolean, cols: number): RenderElement {
  const { Text } = ui
  if (!look.bg) {
    return (
      <Text key={key}>
        <Text bold color={look.mark}>{'▌ '}</Text>
        <Text bold color={look.ink}>{text}</Text>
      </Text>
    )
  }
  const pad = text + ' '.repeat(Math.max(0, cols - 2 - text.length))
  return (
    <Text key={key} backgroundColor={look.bg}>
      <Text bold color={look.mark}>{first ? '❯ ' : '  '}</Text>
      <Text bold color={look.ink}>{pad}</Text>
    </Text>
  )
}

export const register: Register = (on, options) => {
  const style: Style = (STYLES as readonly string[]).includes(String(options.style)) ? (options.style as Style) : 'light row'
  const hueKey = HUES[hueName(options.colour)] ? hueName(options.colour) : 'yellow'
  const look = lookOf(style, HUES[hueKey]!)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'prompt-colours', description: 'Preview every prompt style and colour; set them in /config' }).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'prompt-colours' }, async () => ({ text: 'Prompt styles and colours: set them in /config → Prompt style, Prompt colour.' }))

  // The preview: every style × colour in real colour, the current one marked.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== 'prompt-colours') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const ui = { Box, Text }
    const cols = Math.min(36, Math.max(24, Math.floor(((e.viewport?.columns ?? 110) - 4) / 3)))
    return (
      <Box flexDirection="column">
        <Text dimColor>{'Set in /config → Prompt style and Prompt colour. ◀ is what you use now.'}</Text>
        {STYLES.map(s => (
          <Box key={`pc-${s}`} flexDirection="column" marginTop={1}>
            <Text bold>{s}</Text>
            {Object.entries(HUES).map(([k, hue]) => {
              const isNow = s === style && k === hueKey
              return (
                <Box key={`pc-${s}-${k}`}>
                  {row(ui, `pc-r-${s}-${k}`, lookOf(s, hue), `${hue.emoji} ${k}`, true, cols)}
                  <Text bold color="#facc15">{isNow ? ' ◀' : ''}</Text>
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const o = e.props.origin
    // A slash command's echo may arrive as its stored form: <command-name>/x</command-name> <command-args>…
    const raw = e.props.text
    const cmd = raw.match(/<command-name>\s*(\/?[^<\s]+)\s*<\/command-name>/)
    const args = raw.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim()
    const text = cmd ? `${cmd[1]!.startsWith('/') ? '' : '/'}${cmd[1]}${args ? ` ${args}` : ''}` : raw
    const isCommand = text.trim().startsWith('/')
    // Only what you typed: at the terminal, in the app, or from your phone. A
    // slash command's echo is stored with no stamp, so an unstamped command counts.
    const isYours =
      o.kind === 'composer' ||
      o.kind === 'bridge' ||
      (o.kind === 'sdk' && !/^\s*<task-notification[\s>]/.test(raw)) ||
      (o.kind === 'unclassified' && isCommand)
    if (!isYours || text.trim() === '') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const cols = Math.max(20, (e.viewport?.columns ?? 100) - 2)
    const rows = wrap(text, cols - 3)
    return (
      <Box flexDirection="column" marginTop={1}>
        {rows.map((r, i) => row({ Box, Text }, `ps-${i}`, look, r, i === 0, cols))}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
