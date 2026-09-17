# 0002. TypeScript everywhere, with a C# sidecar for the Windows media session

Status: accepted
Date: 2026-09-17

## Context

Three components have to agree on one message, the heartbeat: the browser
extension that observes playback in the page, the service that ingests it, and
the interface that displays the result.

A browser extension is written in TypeScript. That is not a preference, it is
the platform. So the project is at least bilingual the moment it has a second
language anywhere else.

Capturing desktop players is a different constraint. It means reading
`GlobalSystemMediaTransportControlsSessionManager`, a WinRT API. The reference
path to it is C#, where the projections are generated and maintained by the
platform vendor and an event subscription is a few lines.

Turning a raw title into a work is the hardest part of the product, and the
libraries that already solve pieces of it, in particular anime filename parsing,
exist in JavaScript rather than in .NET.

The browser covers most of what a person watches. Desktop capture matters, but
it is not what makes the first version useful.

## Decision

TypeScript for everything that ships first: a pnpm monorepo with a Node service
on Hono, SQLite through Drizzle, a React interface, and a WXT extension. The
contract between them lives in one package of Zod schemas that all three import.

The Windows media session capture is a separate C# sidecar, added in phase six,
which posts to the same ingest endpoint as the extension and validates against
the same contract.

## Consequences

One toolchain, one test runner, one lint configuration. A change to the
heartbeat shape breaks compilation in every component that got it wrong, instead
of failing at runtime on a field name typo.

Two languages in total, but the second one is confined to a single small
deliverable that speaks to the rest of the system over HTTP like any other
capture source. It can be replaced without touching anything else.

SQLite means no service to start before running the project, and full text
search comes with it rather than as another dependency.

There is no single self contained binary on day one. That is the cost of not
making the native part the centre of gravity, and packaging is dealt with later.

## Alternatives considered

.NET for the whole core. It has the best access to the Windows API and would
make the sidecar unnecessary. Rejected because the extension stays TypeScript
regardless, so the project would be bilingual anyway while losing shared types
between extension and server, and the title parsing libraries would have to be
rewritten by hand.

Rust with windows-rs for the sidecar. Still a reasonable option: a small binary
with no runtime. Not chosen because a subscription that has to survive hours of
playback is more fiddly there than in C#, and the sidecar is not where the
project needs to spend its difficulty budget.

Go for the sidecar. Rejected: WinRT support is immature and no maintained
library covers the media session API.
