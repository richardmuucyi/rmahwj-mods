// Tile sizing and half-block cells, adapted from claude-image-view by Jarrod Watts (hooks/layout.ts, MIT; see
// THIRD-PARTY-NOTICES.md), with his drawsPictures rule. Changes: bigger tiles, a label row wide enough for the
// [ open ] button, PNG size from bytes, the override variable renamed.
// Pure helpers only: no `$` crosses into this file.

export type Size = { width: number; height: number }
export type Cells = { columns: number; rows: number }
export type Tile = { n: number; size: Size | null }

// The picture's box. A cell holds two pixels, one above the other, so 8 rows by 48 columns is 48 x 16 pixels.
const TILE_ROWS = 8
const MAX_COLUMNS = 48
const MIN_COLUMNS = 4
// A terminal cell is about twice as tall as it is wide.
const CELL_ASPECT = 2
// Used when the size is unknown (no file yet, or not a PNG).
const FALLBACK: Size = { width: 16, height: 10 }
// Each tile adds a border on every side and the label row (#N [ open ]) under the picture.
const TILE_CHROME_ROWS = 3
const TILE_CHROME_COLUMNS = 2
const GAP = 1
// The terminal draws a Button as `[ label ]`.
const OPEN_BUTTON = '[ open ]'.length

/** The distinct image numbers the prompt box holds, in the order they first appear. */
export function imageNumbers(text: string): number[] {
  const seen = new Set<number>()
  for (const match of text.matchAll(/\[Image #(\d+)\]/g)) seen.add(Number(match[1]))
  return [...seen]
}

/** Width and height from a PNG's IHDR chunk, or null when the bytes are not (yet) a whole PNG header. */
export function pngSize(bytes: Uint8Array): Size | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((byte, i) => bytes[i] !== byte)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

/** How wide the label row under picture n is: `#N`, a space, the button. */
export function labelColumns(n: number): number {
  return `#${n}`.length + 1 + OPEN_BUTTON
}

/** A picture box at most `tileRows` tall that keeps the picture's aspect ratio. */
export function fitCells(size: Size | null, tileRows = TILE_ROWS): Cells {
  const { width, height } = size ?? FALLBACK
  let rows = tileRows
  let columns = Math.round((rows * CELL_ASPECT * width) / height)
  if (columns > MAX_COLUMNS) {
    columns = MAX_COLUMNS
    rows = Math.max(1, Math.round((MAX_COLUMNS * height) / (CELL_ASPECT * width)))
  }
  return { columns: Math.max(MIN_COLUMNS, columns), rows: Math.min(rows, tileRows) }
}

/**
 * Picture boxes for one row of tiles that fits the band whole, so it never scrolls: the tallest tiles whose chrome
 * fits in `maxRows` and whose total width fits in `bodyColumns`. When even one-row tiles are too wide, only the first
 * ones that fit beside a `+N` label for the rest; none when the band is too small for one tile.
 */
export function fitRow(tiles: readonly Tile[], maxRows: number, bodyColumns: number): Cells[] {
  if (maxRows < TILE_CHROME_ROWS + 1) return []
  const tallest = Math.min(TILE_ROWS, maxRows - TILE_CHROME_ROWS)
  for (let tileRows = tallest; tileRows > 1; tileRows--) {
    const cells = tiles.map(t => fitCells(t.size, tileRows))
    if (rowWidth(tiles, cells, 0) <= bodyColumns) return cells
  }
  const cells = tiles.map(t => fitCells(t.size, 1))
  let count = cells.length
  while (count > 0 && rowWidth(tiles.slice(0, count), cells.slice(0, count), cells.length - count) > bodyColumns) count--
  return cells.slice(0, count)
}

/** A tile is as wide as its picture or its label row, whichever is wider, plus the border. */
function rowWidth(tiles: readonly Tile[], cells: readonly Cells[], hidden: number): number {
  const inner = (c: Cells, i: number) => Math.max(c.columns, labelColumns(tiles[i]!.n))
  const total = cells.reduce((sum, c, i) => sum + inner(c, i) + TILE_CHROME_COLUMNS, 0) + GAP * Math.max(0, cells.length - 1)
  return hidden > 0 ? total + GAP + `+${hidden}`.length : total
}

type Env = Readonly<Record<string, string | undefined>>

/**
 * Whether Claude Code will draw `Image` as real pixels. It decides that itself and does not tell mods, so this mirrors
 * its rule as far as the environment shows it: always when CLAUDE_CODE_FORCE_TERMINAL_IMAGES is set; otherwise never
 * inside tmux or screen or in a background session, and only in kitty or Ghostty (it goes by the terminal's name).
 * Windows Terminal, Terminal.app and iTerm2 get half blocks. `IMAGE_OPEN_RENDERER` overrides the guess: `image` for
 * pixels, `blocks` for half blocks.
 */
export function drawsPictures(env: Env): boolean {
  const forced = env.IMAGE_OPEN_RENDERER
  if (forced === 'image' || forced === 'blocks') return forced === 'image'
  if (env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES) return true
  if (env.TMUX || env.STY || env.CLAUDE_CODE_SESSION_KIND === 'bg') return false
  return (
    Boolean(env.KITTY_WINDOW_ID || env.GHOSTTY_RESOURCES_DIR) ||
    /kitty|ghostty/i.test(env.TERM ?? '') ||
    /^ghostty$/i.test(env.TERM_PROGRAM ?? '')
  )
}

/**
 * The cells of a `Raster` that draws `rgb` (a `width` x `height` thumbnail) in `columns` x `rows` cells, base64. Each
 * cell is an upper half block, so it holds two pixels: the top as its foreground and the bottom as its background.
 * Every pixel keeps its own averaged colour: no palette, no snapping.
 */
export function blockCells(thumb: { width: number; height: number; rgb: Uint8Array }, columns: number, rows: number): string {
  const pixelRows = rows * 2
  const average = (px: number, py: number): number => {
    // The box of source pixels under output pixel (px, py), at least one pixel wide and tall.
    const x0 = Math.floor((px * thumb.width) / columns)
    const x1 = Math.max(x0 + 1, Math.floor(((px + 1) * thumb.width) / columns))
    const y0 = Math.floor((py * thumb.height) / pixelRows)
    const y1 = Math.max(y0 + 1, Math.floor(((py + 1) * thumb.height) / pixelRows))
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = y0; y < y1 && y < thumb.height; y++) {
      for (let x = x0; x < x1 && x < thumb.width; x++, n++) {
        const at = (y * thumb.width + x) * 3
        r += thumb.rgb[at]!
        g += thumb.rgb[at + 1]!
        b += thumb.rgb[at + 2]!
      }
    }
    n = n || 1
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
  }
  const words = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const at = (row * columns + column) * 3
      words[at] = 0x2580
      words[at + 1] = average(column, row * 2)
      words[at + 2] = average(column, row * 2 + 1)
    }
  }
  return new Uint8Array(words.buffer).toBase64()
}
