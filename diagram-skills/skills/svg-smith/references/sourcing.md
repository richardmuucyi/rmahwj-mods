# Sourcing official artwork

The single highest-leverage step. Everything downstream is cheap; getting the wrong source
makes all of it worthless.

## Hunt order, and what each source gets wrong

**1. The brand's own asset pack** — `/logos`, `/press`, `/brand`, `/media-kit`,
`brand.<domain>.com`. Usually a zip of SVG + PDF + PNG across every variant (primary,
reversed, clearspace, sub-brands). Best case by a distance: authoritative geometry, and it
settles colour without guesswork. Follow redirects — a `/logos` path often lands on a
separate brand-toolkit host where the download link lives.

*Gets wrong:* nothing, usually. If a pack exists, use it and stop.

**1b. The DAM portal behind the media kit.** Big brands increasingly hand their media kit to a
digital-asset-manager (Brandfolder, Widen, Bynder, Frontify). The public-facing page may be
login-gated or reduced to a couple of PNGs while the *collection* stays publicly readable
through its JSON API — e.g. `brandfolder.com/<brand>/logos` with
`/api/v4/assets/<id>?include=attachments` returning signed originals (SVG, EPS, CMYK). Worth a
look before concluding a brand publishes no vector.

**1c. An archived snapshot of the media kit.** When a brand migrates its asset host, the old
page often still names the real download URL and that URL is frequently still alive. A Wayback
snapshot of `/media-kit` or `/brand` from a year or two back is a cheap way to recover it. This
is how Slack's actual vector pack was located after the current media kit had been reduced to
two 200×71 PNGs of a *different* mark.

*Gets wrong:* an archived page can point at genuinely dead links, and the mark it advertises may
since have been retired. Confirm what you fetch is current by diffing it against whatever the
brand serves live today.

**2. Inline `<svg>` in the site's own chrome** — header, nav, footer. Enumerate every `<svg>`
and look at `viewBox`, path count, and fills before picking one.

*Gets wrong:* **the inline SVGs are usually not the logo.** This has now bitten three times
independently, so treat it as the rule rather than the exception:

- the biggest logo-shaped SVG on github.com's homepage was **the Vodafone logo**, from a
  customer carousel;
- the biggest on code.visualstudio.com was **Tux the Linux penguin**, the download icon;
- scraping chagee.com and chagee.com.sg returned **ten SVGs, every one a social-media icon**
  (TikTok, Weibo, WeChat, Bilibili, Xiaohongshu) — the brand mark was not among them.

A brand's own site is mostly other people's marks and UI furniture. The XML gives no hint;
one render settles it every time. Also, icon-font versions are optically adjusted for small
sizes and may differ from the brand master.

**3. Linked `.svg` assets** — `img[src]`, CSS `background-image`, and a raw-HTML regex for
`.svg` URLs. CDN paths are often descriptive enough to identify (`.../logo_primary.svg`).

*Gets wrong:* the file may not be vector despite the extension — see below. Filenames also
lie; `logo.svg` may be a sub-brand or a seasonal variant.

**4. Trace a high-resolution raster** — last resort. If you do this, say on delivery that it
is a trace, not official geometry, so nobody treats it as exact.

## `.svg` does not mean vector

An SVG can be a `clipPath` over an embedded base64 raster. The silhouette is then vector and
everything inside it is a photo that will not scale. `svg_probe.py` flags `<image>` elements
and reports whether the href is embedded or external.

When that is the only official form of a colourway, you have three honest options: ship it as
the vendor does and note the raster; substitute a vector fill from another official asset and
document the substitution; or ship both and let the user choose.

## Confirm you got the right artwork

Two cheap checks catch most sourcing errors:

- **Render it and look.** Catches wrong-company logos, seasonal variants, and sub-brands.
- **Cross-check the variants against each other** with `svg_check.py`. If a brand ships the
  mark at several sizes, they are either the same drawing (diff comes back MATCH — take the
  higher-precision one) or genuinely different drawings (MISMATCH — now choose deliberately).
  Aspect ratio alone will not tell you: two different sparkle marks were both exactly square
  and still 37.7% apart.

## Colour comes from the file, not from memory

Icon libraries and "brand colour" listicles propagate hexes that vendors never published.
Read the fill out of the official asset. Three real examples of memory being wrong: a mark
widely listed as `#181717` ships as plain `black`; a badge assumed to be `#C8102E`/`#E60012`
is actually `#FF0000`; a mark everyone renders blue-to-purple ships in a four-colour aurora
in the vendor's current product asset.

When a vendor ships more than one colourway, say so and deliver both rather than silently
picking — that choice is the user's.

## Provenance is part of the deliverable

A file containing a vendor's actual published artwork is a different object from a drawing
you made, and the difference matters to what the user may do with it. State which it is, in
one line, without a lecture. Note trademark reality once if relevant; do not moralise, and do
not refuse ordinary design work because a logo is involved.
