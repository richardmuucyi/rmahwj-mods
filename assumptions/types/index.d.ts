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
  /** The session's tool-call count when it was logged: later calls were built on it. Absent on ones stored before 0.5.0. */
  stepAt?: number
  /** The start of the person's prompt it was made under, at most 60 characters. */
  task?: string
}

/** One corrected assumption, one JSON object per line in ~/.claude/assumptions/<repo slug>.jsonl. */
export type PastCorrection = {
  /** Epoch ms when the correction was recorded. */
  at: number
  session: string
  /** The git top-level folder, forward slashes. */
  repo: string
  id: number
  text: string
  why?: string
  /** The start of the person's prompt the assumption was made under. */
  task?: string
  correction: string
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
      /** Tool calls this session, the assumption tool's own excluded. */
      steps: number
    }
  }
}
