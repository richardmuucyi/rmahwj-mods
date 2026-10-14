# usage-gauge

Two rows under the prompt:

- model and effort, session time, cost, output speed, and tokens in and out;
- context size, and your 5-hour and weekly limits as 10-cell bars with their reset times.

It reads usage figures only and adds no tokens.

## Install

```
/plugin marketplace add richardmuucyi/rmahwj-mods
/plugin install usage-gauge@rmahwj-mods
/reload-plugins
```

## Tests

```
claude plugin test usage-gauge
```
