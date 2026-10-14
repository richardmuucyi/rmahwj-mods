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

export type Kit = { Box: (p: any) => RenderElement; Text: (p: any) => RenderElement; Button: (p: any) => RenderElement }
