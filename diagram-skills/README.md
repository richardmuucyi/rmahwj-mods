# diagram-skills

Three skills for pictures made from structure. Unlike the other plugins here, this one adds no hooks or panels. It adds skills: Claude reads one when your request fits it, and follows its steps and runs its scripts.

| Skill | Use it when you want | What you get |
|---|---|---|
| `d2-diagram` | a new diagram: architecture, flowchart, sequence, ERD, C4, network, state machine, org chart; or a mermaid, Graphviz or PlantUML diagram turned into D2 | the `.d2` source and a rendered `.svg`, checked against the request and looked at in a browser |
| `mermaid-visual-review` | an existing mermaid diagram reviewed, fixed or polished, in a `.md` block or a `.mmd` file | a clean source, a themed render, and a review of what the picture claims against what it should say |
| `svg-smith` | an SVG logo, icon, badge or emblem made, recreated, recoloured or repaired, including a logo file that is far too big or two SVGs that spoil each other's colours on one page | an `.svg` that renders at every size you need, with a check against the original when there is one |

`mermaid-visual-review` does not draw diagrams from nothing. Ask for a new diagram and `d2-diagram` draws it in D2.

## Install

```
/plugin marketplace add richardmuucyi/rmahwj-mods
/plugin install diagram-skills@rmahwj-mods
/reload-plugins
```

Then ask for a diagram or an SVG in your own words. You do not need to name the skill.

## What each skill needs

The skills call tools on your machine. Install the ones for the skills you will use.

**d2-diagram**
- [d2](https://d2lang.com/tour/install). Tested with v0.9.0.
- Python 3. The scripts use the standard library only.
- To look at the render: `npm install -g @playwright/cli@latest`. Without it the skill falls back to a still picture from Chrome, Edge or Chromium.
- For `.drawio` output only: the draw.io desktop app.

**mermaid-visual-review**
- Node.js with npm, Python 3 and [Pillow](https://pypi.org/project/pillow/).
- bash. On Windows that is Git Bash.
- One setup step, which the skill runs itself when the toolchain is missing:
  `bash scripts/toolchain/install.sh` from the skill's folder. It installs a pinned mermaid-cli and downloads Chromium, so the first run takes minutes.
- The toolchain lives inside the plugin's folder, so a plugin update removes it. The next render reports it missing, and the skill installs it again.

**svg-smith**
- Python 3 with `pip install pillow numpy scipy fonttools playwright`, then `playwright install chromium`.
- To trace a raster image into vectors: `pip install opencv-python vtracer`.

## What the skills write

They write files only where you ask, or next to the file they are working on, or in the current folder. Your diagrams and logos are not uploaded anywhere.

They do reach the network in three cases:
- Installing a missing tool downloads it from npm or PyPI.
- To recreate a real brand's logo, `svg-smith` has Claude look for the brand's official artwork on the web.
- `d2-diagram`'s icon advice can check that an icon URL on `icons.terrastruct.com` exists (a HEAD request, nothing sent).

## Read this first

A skill can run commands with your permissions. Read a skill's `SKILL.md` and `scripts/` before you install the plugin.

Developed and tested on Windows 11 with Claude Code 2.1.299. Not tried on macOS or Linux yet. On those, the commands may need `python3` where the skills say `python`.

## Tests

Run these from each skill's folder inside the plugin.

- `d2-diagram`: `python tests/run_harness.py`, `python tests/eval_advisor.py`, `python tests/eval_quality.py`, `python tests/eval_aesthetics.py`, `python tests/eval_reviewer.py`. The suites that drive a browser or draw.io (`eval_visual`, `eval_drawio`, `eval_from_drawio`) have three known failures with d2 v0.9.0.
- `mermaid-visual-review`: `python -m pytest scripts/tests -q`, after the setup step.
- `svg-smith`: no unit tests; `evals/evals.json` holds six cases for a person to run and judge.

## Notices

Some example files show other companies' logos, and one theme takes its colours from an MIT project. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
