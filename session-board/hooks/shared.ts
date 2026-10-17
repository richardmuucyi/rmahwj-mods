// Small pure helpers that the board (register.tsx) and the context guard (guard-glue.tsx) both use.
// Nothing here reads module state.
import type { RenderElement } from 'claude-code'

export function short(text: string, n: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, Math.max(1, n - 1))}…` : one
}

export const same = (a: unknown, b: unknown) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** A row of `width` cells: filled ones for done. */
export function barCells(done: number, total: number, width: number): [number, number] {
  const filled = total > 0 ? Math.min(width, Math.round((done / total) * width)) : 0
  return [filled, width - filled]
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

export function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Every chip of the strip and of the context row sits on this true black (his choice, 2026-10-15): the labels are white text
 *  on it, a status is the status colour as text on it. A hex, not the name "black": the name is the theme's own black,
 *  which can be the same as the background, and the chip would vanish. */
export const LABEL_BG = '#000000'

/** Links and buttons. Not the name "blue", which is the theme's own (#3E63DD on a #282A36 background: 2.7:1, hard to read):
 *  this one is 5.6:1 on that background. */
export const LINK = '#7AA2F7'

/** The text of the two label chips ("current", "others"): dim and plain, so the value beside each label is what stands out
 *  (6.8:1 on the chips' black). */
export const LABEL_FG = '#8B949E'

/** The first chip of the strip ("current") and the status chip of the context row (when it has one) are padded to this many
 *  characters, so both are the same width and the value beside each (the status, the Actions button) starts in the same
 *  cell. The quiet and advice rows have no chip: their Actions button starts at the first cell. */
export const FIRST_COL = 8

export type Kit = { Box: (p: any) => RenderElement; Text: (p: any) => RenderElement; Button: (p: any) => RenderElement }
