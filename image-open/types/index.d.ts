/**
 * One pasted image, keyed by the number in its `[Image #N]` token.
 * The number counts the whole session, not the prompt box, so it is the only safe key.
 */
export type Entry = {
  n: number
  /** Size of the picture, in pixels. */
  w?: number
  h?: number
  /** Where the full-size PNG was saved (in the temp folder). Present means the [open] button works. */
  path?: string
  /** Why there is no file, in a few words: nothing on the clipboard, or it could not be read or saved. The log has the detail. */
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
