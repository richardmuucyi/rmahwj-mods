```json
{
  "critical": [],
  "polish": [
    "Step 3 says '(sees only what you pushed)', but the cited claude-code-on-the-web page makes that true only when the Claude GitHub App is installed on the repo. For a github.com repo without the App, `claude --cloud` uploads a bundle of the local repo instead: all branches plus uncommitted changes to tracked files, which on native Windows upload as they are. That page says this applies even after /web-setup. The App's install state is not stated, so the label is unverified for this setup. Also, the declared source row 'Access to local files | No (fresh clone)' is the Cloud routines column of the scheduling table, not a statement about `claude --cloud`.",
    "The 'claude/' prefix in the 'GitHub claude/your-task' participant label does not appear in its cited source. claude-code-on-the-web.md (and web-quickstart.md) only say the session pushes 'its branch' and that each task gets 'its own branch'. Only 'your-task' was declared a placeholder, so the prefix is unverifiable as drawn."
  ],
  "reading_order_ok": true,
  "semantic_mismatches": []
}
```