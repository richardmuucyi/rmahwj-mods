# Architecture diagram-specific failure modes

This file supplements `references/common-issues.md` for mermaid `architecture-beta` diagrams. Each rule was found on a real render.

## Type-specific issues

### 1. An unquoted label with punctuation breaks the whole diagram

Unquoted labels accept only words and spaces. A hyphen, middot, colon, comma, parenthesis, slash or `<br/>` is a syntax error for the whole diagram, not a dropped label (measured by bisection on 11.16.1).

**Detection:** the render fails, or (see learning 0001) an error image ships as the artefact.
**Fix:** always quote labels: `service x(server)["Any - label: here"]`.

### 2. Group boxes overlap a neighbour

A `group` renders as the bounding rectangle of its members. An ungrouped service beside a group straddles its border; two groups in one row overlap; a group spanning two rows captures the diagonal cell.

**Detection:** a service sits on a group border, or inside a group it does not belong to.
**Fix:** separate groups by row, not by column. Put a shared service on its own row, ungrouped, below every group.

### 3. Two services drawn on one spot

Each `a:R -- L:b` edge is a placement hint. When one service gets hints from two different rows (two paths converging on one store), the engine keeps one hint, drops the other, and draws two services on top of each other with their labels overprinted.

**Detection:** fewer icon tiles in the PNG than services declared, with no parse error.
**Fix:** make every hint agree on one grid, or remove the losing edge.

### 4. The frontmatter title does not render

`---\ntitle: …\n---` parses, but architecture-beta draws no title. Keep the title in the source (Step 2 still applies) and caption the image in the host page.

### 5. The theme applies only partly

The zinc themes restyle edges and group borders (`archGroupBorderColor`). Service tiles stay mermaid blue, because no theme variable drives the icon fills. A themed architecture render is never fully on-palette.

### 6. An edge runs through a service's label

The label sits under the icon. An edge that leaves the bottom of a labelled service (`api:B --> T:queue`) starts inside the label and crosses it.

**Detection:** an edge line passes through the text under an icon (seen: "API layer" crossed by its edge to the queue, in both themes).
**Fix:** `architecture-sideways-edges`.
