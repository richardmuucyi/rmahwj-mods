# Diagramming a system you did not build

When the subject is someone else's system ("how does Bitly work"), the sources are an
engineering blog, a conference talk or a docs page, each written in a different year, and
search results are crowded with generic interview guides. Four rules, each from a mistake
a reviewer caught:

- **Put the year inside the picture, not only in a caption.** Two sources from different
  years describe two different systems. The Bitly diagram first showed a service named in
  a 2014 talk reading a store from a 2023 post — a pairing that never existed, since the
  link data was still in MySQL in 2014. A caption listing both sources did not stop it.
  Mark the era on the node or the container (`"click pipeline (2014 talk)"`, `"Cloud
  Bigtable since 2023\nsharded MySQL before"`).
- **Number steps only when a source states the order.** A step number is a claim. "3 ·
  redirect" then "4 · publish" asserted that the response left before the event was
  published; the source only tied the publish to the decode. Number the order a source
  gives; leave the rest unnumbered.
- **Generic is not specific.** A cache, a load balancer or a 301-vs-302 choice taken from
  an interview guide is not the company's design. Leave it out, or draw it in a separate
  diagram labelled as a generic pattern.
- **Write `# NOT CLAIMED:` lines** beside the `# SOURCE:` block for what you left out on
  purpose and why (`# NOT CLAIMED: no cache, no load balancer -- neither source names
  them`). They tell the stage 5e reviewer what is absent by decision rather than by
  oversight, and pass the source quotes to it as the system description.
