import { expect, test } from 'claude-code/testing'

import { blockCells, drawsPictures, fitCells, fitRow, imageNumbers, labelColumns, pngSize } from '../hooks/layout'

test('image numbers come from the box, deduplicated, in order', () => {
  expect(imageNumbers('look [Image #2] and [Image #1] again [Image #2]')).toEqual([2, 1])
  expect(imageNumbers('[Image 1] [image #3] #4')).toEqual([])
})

test('PNG size is read from the IHDR header; a short or non-PNG file has none', () => {
  const head = new Uint8Array(24)
  head.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(head.buffer).setUint32(16, 1590)
  new DataView(head.buffer).setUint32(20, 238)
  expect(pngSize(head)).toEqual({ width: 1590, height: 238 })
  expect(pngSize(head.subarray(0, 20))).toBeNull()
  expect(pngSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(30).fill(0)]))).toBeNull()
})

test('a tile keeps the aspect ratio: up to 8 rows and 48 columns, never under 4 columns', () => {
  expect(fitCells({ width: 500, height: 500 })).toEqual({ columns: 16, rows: 8 })
  // His real screenshot strip, 1590 x 238: capped at 48 columns, 4 rows.
  expect(fitCells({ width: 1590, height: 238 })).toEqual({ columns: 48, rows: 4 })
  expect(fitCells({ width: 100, height: 2000 })).toEqual({ columns: 4, rows: 8 })
})

test('the label row (#N [ open ]) sets a floor on the tile width', () => {
  expect(labelColumns(2)).toBe(11)
  expect(labelColumns(14)).toBe(12)
  const tall = { width: 100, height: 2000 }
  // One tall tile: picture 4 wide, label 11, border 2 = 13 columns. 12 is too narrow even at one row.
  expect(fitRow([{ n: 2, size: tall }], 20, 13)).toEqual([{ columns: 4, rows: 8 }])
  expect(fitRow([{ n: 2, size: tall }], 20, 12)).toEqual([])
})

test('a row of tiles shrinks to fit the band so it never scrolls', () => {
  const square = { width: 500, height: 500 }
  expect(fitRow([{ n: 1, size: square }], 20, 120)).toEqual([{ columns: 16, rows: 8 }])
  // A short band: border and label take 3 rows, the picture gets the rest.
  expect(fitRow([{ n: 1, size: square }], 7, 120)).toEqual([{ columns: 8, rows: 4 }])
  // Three 8-row squares need 3 * 18 + 2 = 56 columns; 50 forces 7 rows (14 + 2 each, 3 * 16 + 2 = 50).
  const three = [1, 2, 3].map(n => ({ n, size: square }))
  expect(fitRow(three, 20, 50)).toEqual(Array(3).fill({ columns: 14, rows: 7 }))
  // Under one tile's height (3 rows of chrome and 1 of picture), nothing.
  expect(fitRow([{ n: 1, size: square }], 3, 120)).toEqual([])
})

test('a row too wide even at one row keeps the tiles that fit beside a +N label', () => {
  const square = { width: 500, height: 500 }
  const ten = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, size: square }))
  // One-row squares are 4 wide but their label is 11 (12 for #10): 13 columns a tile. Two with a gap and " +8" take 30.
  expect(fitRow(ten, 20, 30)).toEqual(Array(2).fill({ columns: 4, rows: 1 }))
})

test('real pixels only where Claude Code draws them: kitty or Ghostty, not inside tmux or screen or a background session', () => {
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty' })).toBe(true)
  expect(drawsPictures({ TERM: 'xterm-ghostty' })).toBe(true)
  expect(drawsPictures({ GHOSTTY_RESOURCES_DIR: '/Applications/Ghostty.app/Contents/Resources/ghostty' })).toBe(true)
  expect(drawsPictures({ TERM: 'xterm-kitty' })).toBe(true)
  expect(drawsPictures({ KITTY_WINDOW_ID: '1' })).toBe(true)
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty', TMUX: '/tmp/tmux-501/default,1,0' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty', STY: '123.pts' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty', CLAUDE_CODE_SESSION_KIND: 'bg' })).toBe(false)
  // Windows Terminal, Terminal.app, iTerm2, WezTerm: half blocks.
  expect(drawsPictures({ WT_SESSION: 'x' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'Apple_Terminal' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'iTerm.app' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'WezTerm' })).toBe(false)
  // The overrides.
  expect(drawsPictures({ TERM_PROGRAM: 'Apple_Terminal', CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })).toBe(true)
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty', IMAGE_OPEN_RENDERER: 'blocks' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'Apple_Terminal', IMAGE_OPEN_RENDERER: 'image' })).toBe(true)
})

test('blockCells: one upper half block a cell, top pixel as foreground, bottom as background', () => {
  // 1 x 2 pixels: red over blue, drawn in one cell.
  const thumb = { width: 1, height: 2, rgb: new Uint8Array([255, 0, 0, 0, 0, 255]) }
  const bytes = Uint8Array.fromBase64(blockCells(thumb, 1, 1))
  expect([...new Uint32Array(bytes.buffer, bytes.byteOffset, 3)]).toEqual([0x2580, 0xff0000, 0x0000ff])
})
