# System Architecture Notes

Two diagrams in this file. The skill should prompt for which one to review rather than guess.

## High-level flow

```mermaid
flowchart LR
    User --> Web[Web app]
    Web --> API[API gateway]
    API --> DB[(Database)]
```

Some prose between the two blocks.

## Sequence detail

```mermaid
sequenceDiagram
    participant User
    participant Web
    participant API
    User->>Web: Click "Submit"
    Web->>API: POST /submit
    API-->>Web: 200 OK
    Web-->>User: Confirmation
```

Trailing prose.
