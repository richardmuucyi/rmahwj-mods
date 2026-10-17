import type { On } from 'claude-code'

// A fake repository for the git slots: it answers `git status --porcelain=v2 --branch` and `git fetch` the way git does,
// and records every command the gauge runs, so a test can hold them all to reads.

export type Counts = {
  /** The branch HEAD is on. */
  branch: string
  /** True: HEAD is on a commit; git prints "(detached)" for the branch. */
  detached: boolean
  /** Null: no upstream (git then prints no `# branch.ab` line). */
  ahead: number | null
  behind: number
  /** Tracked files modified in the working tree. */
  modified: number
  /** Tracked files staged. */
  staged: number
  conflicts: number
  untracked: number
}

export type Repo = {
  /** False: git answers "not a git repository" (exit 128) to everything. */
  isRepo: boolean
  counts: Counts
  /** Does `git fetch` succeed? */
  fetchOk: boolean
  /** True: git does not answer at all (no git installed, a timeout). */
  down?: boolean
  /** What a successful fetch changes, e.g. the remote's new commits arriving. */
  onFetch?: (counts: Counts) => void
  /** Every command run, with its init. */
  runs: { argv: string[]; init?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } }[]
  fetches: number
}

export const CLEAN: Counts = { branch: 'main', detached: false, ahead: 0, behind: 0, modified: 0, staged: 0, conflicts: 0, untracked: 0 }

export function fakeRepo(counts: Partial<Counts> = {}): Repo {
  return { isRepo: true, counts: { ...CLEAN, ...counts }, fetchOk: true, runs: [], fetches: 0 }
}

/** `git status --porcelain=v2 --branch` for these counts: the headers, then one line per file. */
export function porcelain(c: Counts): string {
  const h = 'a'.repeat(40)
  const lines = ['# branch.oid ' + h, `# branch.head ${c.detached ? '(detached)' : c.branch}`]
  if (c.ahead !== null) lines.push('# branch.upstream origin/main', `# branch.ab +${c.ahead} -${c.behind}`)
  for (let i = 0; i < c.staged; i++) lines.push(`1 M. N... 100644 100644 100644 ${h} ${h} staged-${i}.md`)
  for (let i = 0; i < c.modified; i++) lines.push(`1 .M N... 100644 100644 100644 ${h} ${h} modified-${i}.md`)
  for (let i = 0; i < c.conflicts; i++) lines.push(`u UU N... 100644 100644 100644 100644 ${h} ${h} ${h} conflict-${i}.md`)
  for (let i = 0; i < c.untracked; i++) lines.push(`? untracked-${i}.png`)
  return lines.join('\n') + '\n'
}

/** Answers `process.run` from the repo. Anything but git status and git fetch gets an empty success, and is recorded. */
export function stubGit(on: On, repo: Repo): void {
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    repo.runs.push({ argv, init: e.init as Repo['runs'][number]['init'] })
    const out = (stdout: string, exitCode = 0, stderr = '') => ({
      value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (repo.down) return { deny: 'timed out' }
    if (!repo.isRepo) return out('', 128, 'fatal: not a git repository (or any of the parent directories): .git')
    if (argv.includes('fetch')) {
      repo.fetches++
      if (!repo.fetchOk) return out('', 128, 'fatal: unable to access remote')
      repo.onFetch?.(repo.counts)
      return out('')
    }
    if (argv.includes('status')) return out(porcelain(repo.counts))
    return out('')
  })
}

/** The git subcommand of a recorded argv: the first word after `git` that is not an option or an option's value. */
export function subcommand(argv: string[]): string | undefined {
  let i = 1
  while (i < argv.length) {
    const a = argv[i] ?? ''
    if (a === '-c' || a === '-C') i += 2
    else if (a.startsWith('-')) i += 1
    else return a
  }
  return undefined
}
