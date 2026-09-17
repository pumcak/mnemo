# Architecture decision records

Short notes on the decisions that shaped Mnemo, kept so the reasoning survives
the commit that applied it. A record explains why a path was taken and what it
costs, not how the code works.

One record per decision, numbered in order, never rewritten once accepted. A
decision that turns out wrong gets a new record that supersedes the old one, and
the old one stays for the history.

Worth a record: anything that would make a reader ask "why is it done this way",
anything that closes a door, anything a later contributor might undo without
knowing what it would break. Not worth a record: library choices with no
consequence, naming, formatting.

## Records

- [0001](0001-local-first-service.md) Run as a local first service
- [0002](0002-typescript-with-a-csharp-sidecar.md) TypeScript everywhere, with a
  C# sidecar for the Windows media session
