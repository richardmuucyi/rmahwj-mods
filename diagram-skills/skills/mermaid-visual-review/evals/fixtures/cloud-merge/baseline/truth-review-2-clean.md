```json
{
  "critical": [],
  "polish": [
    "Step 4 says '(main is untouched)', which reads like a guarantee. It is only the session's default. cloud-environments.md, GitHub proxy section, says: 'It doesn't limit which branches a push can update. To do that, use branch protection rules or rulesets on GitHub.' No source says main is protected in this repo, so nothing stated outside the session keeps it off main. The note 'Close the PR unmerged: main stays as it was' depends on this default.",
    "Step 3, '(needs the Claude GitHub App: then it sees only what you pushed)', makes the App sound like a hard requirement. The source says that without the App, `claude --cloud` does not fail. It uploads a bundle 'plus uncommitted changes to tracked files', and on native Windows these 'upload as they are, whatever the file's name'. On that path the session sees more than you pushed, and the work arrives from You, not from GitHub main. The sources do not say whether the App is installed on example-org/garden-journal. So it is unknown which path this repo actually takes.",
    "Arrow A1 starts at the 'GitHub claude/your-task' lifeline, but its label says 'you create a PR (in claude.ai/code)'. The person who acts is you, so the arrow's start does not match its own label.",
    "The declared fact 'the session pushes claude/ branches' cites claude-code-on-the-web.md, but that page never contains 'claude/'. The claim may still be true, but nothing quoted shows it. Cite where the prefix comes from, or mark it SOURCE-EXEMPT."
  ],
  "reading_order_ok": true,
  "semantic_mismatches": [],
  "verified_claims": [
    "Steps 1 then 2 (push before claude --cloud): held. claude-code-on-the-web.md: 'not your local checkout, so push first if you have local commits'.",
    "Step 2, claude --cloud starts a cloud session: held. Same page: 'This creates a new cloud session on claude.ai.'",
    "Step 3, 'clones main': held for this repo. Doc: 'clones your current directory's GitHub remote at your current branch'. Sources: the current branch is main.",
    "Step 3, clone needs the Claude GitHub App: held as a condition ('from a github.com repository that the Claude GitHub App isn't installed on, Claude Code bundles your local repository'). Whether the App is installed on this repo: unverifiable (confidence 0.3 either way; no source says).",
    "Step 3, 'then it sees only what you pushed': held for the clone path. It did not hold for the bundle path ('plus uncommitted changes to tracked files').",
    "Lifeline 'GitHub claude/your-task' and step 4 pushing a claude/ branch: the push is held (docs: 'it pushes its branch to GitHub'). The claude/ prefix is not stated in the cited doc page.",
    "Step 4, '(main is untouched)': default behaviour only, with no guarantee (confidence 0.6 as stated). cloud-environments.md: 'It doesn't limit which branches a push can update'. No source says main is protected.",
    "A1, create the PR in claude.ai/code: held. Doc: 'When a session completes, you can create a PR from claude.ai/code'.",
    "PR flow needs GitHub, and the remote is GitHub: held. Limitations: 'repository cloning and pull request creation require GitHub'. Sources: remote git@github.com:example-org/garden-journal.git, default branch main.",
    "A4, git pull as a merge: held. Sources: git config pull.rebase=false.",
    "A4, git pull --rebase + git push replays your local commits on top of main and pushes them: held. git-pull docs, --rebase.",
    "Conflict note, 'git pull in A4 ... stops on a conflict': held. git-pull docs: a conflict stops the merge or rebase and leaves it for you to resolve.",
    "Conflict note, 'PR conflicts at A3 (main moved): ask the cloud session to rebase': held. Auto-fix section: 'GitHub does not emit a webhook when the base branch advances ... To resolve a conflict, open the session and ask Claude to rebase.'",
    "Route B (local git fetch + merge of the claude/ branch, then push): standard git, nothing in the sources contradicts it.",
    "Title, 'how the work gets back to your PC': held. Route A ends with A4 pulling main onto the PC. Route B merges on the PC and pushes.",
    "Order A1 to A4 and B1 to B2: held by the mechanics. The Files changed tab exists only after the PR, the merge comes before the pull, and the merge comes before the push. No source states the numbering, but none contradicts it.",
    "'Close the PR unmerged: main stays as it was': held, provided step 4 pushed only to the claude/ branch (see the polish item on 'main is untouched')."
  ]
}
```