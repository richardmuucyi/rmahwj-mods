/**
 * One pasted image, keyed by the number in its `[Image #N]` token.
 * The number counts the whole session, not the prompt box, so it is the only safe key.
 */
export type Entry = {
  n: number
  /** Size of the picture, in pixels (PNG only). */
  w?: number
  h?: number
  /** Claude Code's own copy of the paste, forward slashes. Present means the [open] button works. */
  path?: string
  /** Half-block tiles: the small decoded copy the tile is drawn from. `rgb` is base64, 3 bytes a pixel, row by row. */
  thumb?: { width: number; height: number; rgb: string }
  /** Real-pixel tiles (kitty, Ghostty): the PNG the terminal draws, the paste itself or a converted copy of it. */
  png?: string
  /** Why a found file has no thumbnail, in a few words (not a PNG and not converted, over the 4 MiB read limit, could not decode). */
  note?: string
  /** Why there is no file at all, in a few words. The log has the detail. */
  failed?: string
}

declare module 'claude-code' {
  interface PluginState {
    'image-open': {
      /** One entry per `[Image #N]` token now in the prompt box, oldest first. */
      images: Entry[]
    }
  }
}
