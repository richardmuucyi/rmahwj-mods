# Auth Token Lifecycle

The author has already injected `flowchart-padding-init` to give edge labels breathing room. The reviewer's job is to keep that padding intact when the zinc-light theme is added — historically the themed render would silently drop the padding because two competing `%%{init: …}%%` blocks were emitted.

```mermaid
---
title: Auth Token Lifecycle
---
%%{init: {'theme':'base','themeVariables':{'fontSize':'14px','fontFamily':'system-ui'},'flowchart':{'padding':18,'nodeSpacing':55,'rankSpacing':75}}}%%
flowchart LR
    A[Client requests token] -->|"POST /oauth/token"| B[Auth server]
    B -->|"validate client_id"| C{Valid?}
    C -->|yes| D[Issue access_token + refresh_token]
    C -->|no| E[401 Unauthorized]
    D -->|"token expires after 1h"| F[Client uses refresh_token]
    F --> B
```
