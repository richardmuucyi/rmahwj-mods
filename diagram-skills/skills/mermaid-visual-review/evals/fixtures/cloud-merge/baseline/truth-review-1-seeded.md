```json
{
  "critical": [
    "Step 3 '(sees only what you pushed)' is stated without its condition. The `claude --cloud` docs make it depend on the Claude GitHub App being installed on the repo: 'When you run `claude --cloud` ... from a github.com repository that the Claude GitHub App isn't installed on, Claude Code bundles your local repository and uploads it directly ... This applies even if you connected GitHub with /web-setup.' That bundle 'includes your repository history across all branches, plus uncommitted changes to tracked files'. The docs add: 'Native Windows: uncommitted changes to tracked files upload as they are, whatever the file's name.' The sources do not say whether the App is installed on example-org/garden-journal, and I cannot open the repo to check. So the arrow 'fresh clone of main' and its caption are right only if the App is installed. Without the App they are wrong, and a reader who trusts 'sees only what you pushed' may send uncommitted edits to the cloud."
  ],
  "polish": [
    "Step 3 'fresh clone of main': the docs say the VM 'clones your current directory's GitHub remote at your current branch'. The label is correct here only because the current branch is main (stated in the sources). 'of your current branch (main)' would stay true if that changes.",
    "A1 arrow: the label says 'you create a PR (in claude.ai/code)', but the arrow starts at the 'GitHub claude/your-task' lifeline. Neither you nor claude.ai/code is the sender. The docs put the action in claude.ai/code: 'select Create PR at the top of the diff view'.",
    "Route B '(no review page)': claude.ai/code has a review page in both routes. The docs say: 'Each session shows a diff indicator ... Select it to open the diff view, leave inline comments'. Route B only skips GitHub's PR page. A label like 'no GitHub PR page' would be accurate.",
    "The conflict note names only A4 and B1. The docs describe a third place, A3: 'GitHub does not emit a webhook when the base branch advances and creates a merge conflict ... To resolve a conflict, open the session and ask Claude to rebase.' If main moved during the session, Route A stops at A3, and the fix there is in the cloud session, not on the PC."
  ],
  "reading_order_ok": true,
  "semantic_mismatches": [
    "Diagram says step 3 is always a fresh clone that 'sees only what you pushed'. The source says this holds only when the Claude GitHub App is installed on the repo. Otherwise `claude --cloud` uploads a bundle of the local repo, with uncommitted tracked changes (claude-code-on-the-web.md, 'Send local repositories without GitHub').",
    "The declared source for 'fresh clone' is the scheduled-tasks comparison table. That table's 'Cloud' column is Routines, not `claude --cloud`. The fact was carried over to a path with different upload rules."
  ],
  "verified_claims": [
    "Step 1 comes before step 2 (push first): held. claude-code-on-the-web.md: 'clones ... at your current branch, not your local checkout, so push first if you have local commits'.",
    "A4 'git pull --rebase + git push' replays your local commits on top of main, then pushes them: held. git-pull docs, --rebase: the current branch is rebased on top of the upstream branch.",
    "'git pull in A4 or git merge in B1 stops' on a conflict: held. git-pull docs: a conflict stops the merge or rebase and leaves it for you to resolve.",
    "type `claude --cloud \"your task\"` starts a cloud session (step 2): held. Docs: 'claude --cloud \"Fix the authentication bug in src/auth/login.ts\"'. 'This creates a new cloud session on claude.ai.'",
    "Step 3 'fresh clone of main (sees only what you pushed)': conditional, see critical. Holds on the branch point (current branch = main, as stated). Does not hold if the Claude GitHub App is not installed (bundle upload). Install status could not be checked.",
    "'Access to local files | No (fresh clone)': held as a quote, but scheduled-tasks.md uses it for the Cloud/Routines column, not for `claude --cloud`.",
    "Step 4, the session pushes to its own claude/ branch and main is untouched: held. The docs say 'it pushes its branch to GitHub' (web-quickstart.md, 'How sessions run'). The 'claude/' prefix is not in the docs text I fetched, and no quoted repo fact shows it, so the prefix itself is unverified.",
    "A1, you create the PR in claude.ai/code after the session completes: held. Docs: 'When a session completes, you can create a PR from claude.ai/code'. Quickstart: 'select Create PR at the top of the diff view'.",
    "Cloning and PR creation need GitHub, and the repo's remote is GitHub: held. Docs Limitations: 'repository cloning and pull request creation require GitHub'. Sources: the remote is git@github.com:example-org/garden-journal.git.",
    "Route A (merge the PR on GitHub, then pull): consistent with the docs ('create a PR from claude.ai/code') and standard GitHub behaviour. No repo history is quoted to confirm it was used.",
    "Route B (local git merge of the claude/ branch, then push): standard git, nothing in the sources contradicts it. No repo history is quoted to confirm it was used.",
    "A4 'git pull' = fetch + merge: held. Sources: git config pull.rebase=false.",
    "'Not happy? Close the PR unmerged: main stays as it was': unverifiable against the declared facts. It is standard GitHub behaviour and nothing contradicts it.",
    "B2 'git push' to main: unverifiable against the declared facts. It is standard git.",
    "Title 'Cloud session to main: how the work gets back to your PC': held. Both routes end with the work on main and on the PC."
  ]
}
```