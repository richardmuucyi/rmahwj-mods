/** One expert on a ++panel card: the field, whether their job is to find what is wrong, what they would do, and with which methods. */
export type PanelExpert = { field: string; critic: boolean; work: string; methods: string }

/** A draft Claude wrote for you: a brief or a panel to approve, a /goal or /loop to start, or a deeper prompt to send. */
export type DraftedCommand = {
  kind: 'brief' | 'goal' | 'loop' | 'deep' | 'panel'
  /** For goal and loop: everything after the command name. For a brief: its text. For deep: the rewritten prompt. For a panel: its lines. */
  args: string
  /** The draft's labelled parts, in order, as Claude wrote them. */
  parts: { label: string; value: string }[]
  /** For deep: how many words your own request had, to set beside the rewrite's. */
  words?: number
  /** For a panel: the experts, one per line Claude wrote. */
  experts?: PanelExpert[]
  /** For a panel: what the reply says outside the panel block, spaces collapsed. It may settle a choice you never made, so the card shows it. */
  note?: string
}

/** One change the grammar model listed: a quote before, the quote after, why. */
export type GrammarFix = { before: string; after: string; category: string; why: string; level: 'fix' | 'tip' }

/** One change found by comparing your words with the corrected ones. `applied: false` means it was held back. */
export type GrammarHunk = { del: string[]; ins: string[]; applied: boolean; category: string; why: string }

/** A stretch of the text as the card draws it. */
export type GrammarSeg = { kind: 'same' | 'del' | 'ins' | 'held'; text: string }

/** The reviewed result of a check. */
export type GrammarReview = {
  /** What was typed. */
  original: string
  /** The text with every applied change in it. Held changes keep the writer's own words. */
  text: string
  hunks: GrammarHunk[]
  applied: number
  held: number
  segments: GrammarSeg[]
  /** Suggestions the model made that are not in the text. */
  tips: GrammarFix[]
}

/** The grammar card: a check under way, its reviewed result, or why there is none. */
export type GrammarCard =
  | { status: 'checking'; original: string }
  | { status: 'done'; review: GrammarReview }
  | { status: 'failed'; why: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      /** A draft waiting for you; null for none. */
      ready: DraftedCommand | null
      /** What is being drafted and how many turns are left to catch it; null when nothing is. */
      drafting: { kind: 'brief' | 'goal' | 'loop' | 'deep' | 'panel'; turnsLeft: number; words?: number } | null
      /** The `==` grammar card; null for none. */
      grammar: GrammarCard | null
    }
  }
}
