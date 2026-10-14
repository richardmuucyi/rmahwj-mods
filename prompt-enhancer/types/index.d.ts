/** A draft Claude wrote for you: a brief to approve, or a /goal or /loop to start. */
export type DraftedCommand = {
  kind: 'brief' | 'goal' | 'loop'
  /** For goal and loop: everything after the command name. For a brief: its text. */
  args: string
  /** The draft's labelled parts, in order, as Claude wrote them. */
  parts: { label: string; value: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      /** A draft waiting for you; null for none. */
      ready: DraftedCommand | null
      /** What is being drafted and how many turns are left to catch it; null when nothing is. */
      drafting: { kind: 'brief' | 'goal' | 'loop'; turnsLeft: number } | null
    }
  }
}
