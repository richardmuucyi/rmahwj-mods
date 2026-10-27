#!/usr/bin/env bash
# mermaid-visual-review render wrapper
# Usage:
#   render.sh <input.mmd> <output.png> [theme_or_css_path] [extra mmdc args...]
#
# Third arg may be:
#   - a path to a .css file → injected via mmdc -C
#   - a path to a .json theme file → themeVariables merged with any existing
#     init block in the source via merge_theme.py, then mmdc renders the result
#   - omitted → no theming (Phase A baseline render)
#
# Why a merger and not a second init block? Phase A may have already injected
# `%%{init: {... flowchart: {padding: 18, ...} ...}}%%`. Two init blocks compete
# and mermaid silently keeps one — the Phase A spacing fixes would vanish from
# the themed render. merge_theme.py produces a single init block that contains
# both Phase A's structural directives and the theme's themeVariables.
#
# Exits 0 on success, non-zero on render failure.

set -euo pipefail

if [[ $# -lt 2 ]]; then
    echo "Usage: render.sh <input.mmd> <output.png> [theme.json|theme.css] [extra mmdc args...]" >&2
    exit 2
fi

input="$1"
output="$2"
shift 2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Renders through the locally installed, lockfile-pinned toolchain rather than
# the npx path this replaced. That path re-resolved mermaid-cli's
# `mermaid: ^11.14.0` on every fresh cache, silently drifting the engine ahead
# of the pinned version — the exact bug this wrapper exists to prevent.
# Versions live in toolchain/VERSIONS.
MMDC="$SCRIPT_DIR/toolchain/target/node_modules/.bin/mmdc"

if [[ ! -x "$MMDC" ]]; then
    echo "Render toolchain not installed. Run: bash $SCRIPT_DIR/toolchain/install.sh" >&2
    exit 3
fi

css_args=()
working_input="$input"
tmp_themed=""
# Page ground. Unthemed renders stay transparent: the source may carry its own
# theme, and forcing a ground on it is how a white page once landed under dark
# diagrams. A .json theme gets the ground for its `kind` (merge_theme.py
# --ground), because a transparent themed render does NOT adapt to the page:
# zinc-light on a dark page lost its title and showed white label patches
# (measured 2026-10-18).
ground="transparent"

if [[ $# -gt 0 && -f "$1" ]]; then
    if [[ "$1" == *.json ]]; then
        theme="$1"
        tmp_themed=$(mktemp -t mermaid-themed.XXXXXX.mmd)
        trap '[[ -n "${tmp_themed:-}" && -f "$tmp_themed" ]] && rm -f "$tmp_themed"' EXIT
        python3 "$SCRIPT_DIR/merge_theme.py" "$theme" "$input" "$tmp_themed"
        ground="$(python3 "$SCRIPT_DIR/merge_theme.py" --ground "$theme")"
        working_input="$tmp_themed"
        shift
    elif [[ "$1" == *.css ]]; then
        css_args=("-C" "$1")
        shift
    fi
fi

"$MMDC" \
    -i "$working_input" \
    -o "$output" \
    -w 1800 \
    -b "$ground" \
    --quiet \
    ${css_args[@]+"${css_args[@]}"} \
    "$@"

# The PNG is the instrument — the agent must actually look at the diagram to
# critique it. The SVG is the deliverable: it scales, keeps text selectable, and
# adapts to the page it lands on. mmdc infers format from the output extension,
# so this is a second invocation of the same pinned binary on the same source.
#
# Only .png output gets a companion SVG. .pdf deliberately does not — mmdc's
# background flag does not apply to PDFs, so a "transparent SVG companion"
# has no meaning there.
if [[ "$output" == *.png ]]; then
    svg_output="${output%.png}.svg"
    # -e svg is appended AFTER "$@" so it wins over any -e/--outputFormat the
    # caller forwarded (e.g. a leftover -e png meant for the PNG render).
    # mmdc's -e overrides extension-based format inference, so without this
    # a forwarded -e png silently makes the .svg deliverable a real PNG —
    # exit 0, no warning at any layer. Verified empirically, not assumed.
    "$MMDC" \
        -i "$working_input" \
        -o "$svg_output" \
        -w 1800 \
        -b "$ground" \
        --quiet \
        ${css_args[@]+"${css_args[@]}"} \
        "$@" \
        -e svg
fi
