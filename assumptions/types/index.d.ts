export type Assumption = {
  id: number
  /** The assumption, one sentence, as Claude logged it. */
  text: string
  /** Why Claude assumed it, if given. */
  why?: string
  /** High: a mistake here would be costly to undo. Reviewed first, drawn in yellow. */
  impact?: 'high' | 'low'
  status: 'open' | 'right' | 'wrong'
  /** What the person said it should be, once marked wrong and sent. */
  correction?: string
  /** Epoch ms when Claude logged it. */
  at?: number
  /** Epoch ms of the last Skip: skipped ones go to the back of the queue. */
  skippedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    assumptions: {
      list: Assumption[]
      /** Id of the assumption whose correction field is open, or null. */
      editing: number | null
      isWorking: boolean
      /** The next assumption's number; never reset, so numbers never repeat. */
      nextId: number
      /** Whether the panel lists the reviewed assumptions too. */
      showReviewed: boolean
    }
  }
}
