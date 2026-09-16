# Roadmap

Mnemo is built one increment at a time. One increment is one branch, one pull
request, and one merge. Increments are ordered so that every merge leaves the
project in a working state.

72 increments, grouped in 8 phases. The order inside a phase is fixed, the size of
an increment is deliberately small enough to finish in a single sitting.

## Phase 0: foundations (1 to 6)

| #   | Branch                | Increment                                                                                                                 |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | `chore/bootstrap`     | pnpm workspace, Turborepo, base tsconfig, editorconfig, license, README skeleton, local exclude for the instructions file |
| 2   | `chore/lint`          | Shared ESLint and Prettier config, root lint script                                                                       |
| 3   | `chore/test-setup`    | Vitest at the root, one smoke test per package                                                                            |
| 4   | `ci/pipeline`         | GitHub Actions: install, typecheck, lint, test, status badge                                                              |
| 5   | `feat/contracts-base` | `@mnemo/contracts`: Zod schemas for Heartbeat, Device, Source, with inferred types                                        |
| 6   | `docs/adr`            | ADR folder, ADR-0001 local-first architecture, ADR-0002 stack decision                                                    |

## Phase 1: server and storage (7 to 16)

| #   | Branch                    | Increment                                                                |
| --- | ------------------------- | ------------------------------------------------------------------------ |
| 7   | `feat/server-skeleton`    | Hono app bound to 127.0.0.1, health endpoint, env driven config          |
| 8   | `feat/logging`            | Structured logging with pino, request logging middleware                 |
| 9   | `feat/sqlite`             | SQLite connection in WAL mode, Drizzle setup, migration runner           |
| 10  | `feat/schema-devices`     | Tables for devices and sources, with migrations                          |
| 11  | `feat/schema-sessions`    | Playback session and heartbeat tables, retention strategy                |
| 12  | `feat/ingest-endpoint`    | POST /ingest/heartbeat, validated against contracts, persisted raw       |
| 13  | `feat/pairing-token`      | Token generated on first run, persisted, pairing endpoint                |
| 14  | `feat/auth-middleware`    | Token required on every request, CORS restricted to the extension origin |
| 15  | `test/ingest-integration` | Integration tests on ingest, including rejection without a valid token   |
| 16  | `feat/error-handling`     | Consistent error responses, 400 on invalid payloads                      |

## Phase 2: browser capture (17 to 28)

| #   | Branch                         | Increment                                                                  |
| --- | ------------------------------ | -------------------------------------------------------------------------- |
| 17  | `feat/extension-scaffold`      | WXT project, MV3 manifest, Chrome dev build                                |
| 18  | `feat/extension-firefox`       | Firefox build target, unified build script                                 |
| 19  | `feat/video-detection`         | Content script detecting video elements, including those added dynamically |
| 20  | `feat/playback-state`          | Playback state machine: play, pause, seek, ended, throttled progress       |
| 21  | `feat/title-extraction`        | Generic title extraction: document title, og:title, JSON-LD, MediaSession  |
| 22  | `feat/adapter-registry`        | Per hostname adapter architecture with a generic fallback                  |
| 23  | `feat/adapter-netflix`         | Netflix web adapter: title, season, episode                                |
| 24  | `feat/adapter-crunchyroll`     | Crunchyroll adapter                                                        |
| 25  | `feat/adapter-generic-players` | Generic player adapter, including iframe embedded players                  |
| 26  | `feat/heartbeat-queue`         | Background worker: heartbeat queue and batching                            |
| 27  | `feat/offline-resilience`      | Retry with backoff, queue persisted in extension storage                   |
| 28  | `feat/extension-options`       | Options page: pairing, global pause, domain blocklist                      |

## Phase 3: title resolution (29 to 40)

The core of the product. Everything here is covered by snapshot tests over a
corpus of real raw titles.

| #   | Branch                     | Increment                                              |
| --- | -------------------------- | ------------------------------------------------------ |
| 29  | `feat/resolver-skeleton`   | Resolver package, corpus fixture of real raw titles    |
| 30  | `feat/title-cleaning`      | Strip quality, language and release group tags         |
| 31  | `feat/season-episode`      | Season and episode extraction, multiple patterns       |
| 32  | `feat/anime-parsing`       | anitomyscript integration for anime filenames          |
| 33  | `feat/tmdb-client`         | TMDB search client, rate limiting, response cache      |
| 34  | `feat/anilist-client`      | AniList GraphQL client, response cache                 |
| 35  | `feat/candidate-scoring`   | Weighted scoring of candidates, confidence score       |
| 36  | `feat/media-routing`       | Route a raw title to movie, series or anime resolution |
| 37  | `test/resolver-snapshots`  | Snapshot tests over the whole corpus                   |
| 38  | `feat/alias-dictionary`    | Alias table consulted before any API call              |
| 39  | `feat/review-queue`        | Low confidence resolutions persisted for manual review |
| 40  | `feat/resolution-backfill` | Cache and backfill of previously unresolved sessions   |

## Phase 4: sessions and views (41 to 47)

| #   | Branch                   | Increment                                                  |
| --- | ------------------------ | ---------------------------------------------------------- |
| 41  | `feat/session-assembly`  | Build sessions from heartbeats with gap tolerance          |
| 42  | `feat/progress-tracking` | Progress and last known position per session               |
| 43  | `feat/view-validation`   | Promote a session to a view past the duration threshold    |
| 44  | `feat/source-dedup`      | Deduplicate concurrent sources reporting the same playback |
| 45  | `feat/binge-detection`   | Consecutive episode handling                               |
| 46  | `feat/works-schema`      | Works, seasons and episodes tables, upsert from resolution |
| 47  | `feat/stats-queries`     | Aggregations: hours per period, per platform, per genre    |

## Phase 5: web interface (48 to 57)

| #   | Branch                   | Increment                                                   |
| --- | ------------------------ | ----------------------------------------------------------- |
| 48  | `feat/web-scaffold`      | Vite, React, Tailwind, shadcn/ui                            |
| 49  | `feat/api-client`        | Typed client generated from contracts, TanStack Query setup |
| 50  | `feat/serve-static`      | Server serves the built interface                           |
| 51  | `feat/timeline`          | Activity timeline                                           |
| 52  | `feat/continue-watching` | Continue watching section with resume information           |
| 53  | `feat/work-detail`       | Work page: episodes, progress, viewing history              |
| 54  | `feat/stats-dashboard`   | Statistics dashboard with charts                            |
| 55  | `feat/review-ui`         | Review queue interface: confirm or correct a resolution     |
| 56  | `feat/settings-ui`       | Settings: token, pause, blocklist, API keys                 |
| 57  | `feat/search`            | Full text search over works and aliases using FTS5          |

## Phase 6: Windows capture (58 to 64)

| #   | Branch                   | Increment                                                      |
| --- | ------------------------ | -------------------------------------------------------------- |
| 58  | `spike/smtc-feasibility` | Throwaway script reading the SMTC, findings recorded in an ADR |
| 59  | `feat/sidecar-skeleton`  | C# sidecar reading current SMTC sessions once                  |
| 60  | `feat/smtc-subscription` | Subscribe to session and playback changes, long running loop   |
| 61  | `feat/smtc-mapping`      | Map SMTC payloads to the shared heartbeat contract             |
| 62  | `feat/sidecar-ingest`    | Authenticated posting to the ingest endpoint, retry on failure |
| 63  | `feat/app-filtering`     | Configurable allowlist of source applications                  |
| 64  | `feat/sidecar-autostart` | Run at login, logging, graceful shutdown                       |

## Phase 7: ship (65 to 72)

| #   | Branch                    | Increment                                                           |
| --- | ------------------------- | ------------------------------------------------------------------- |
| 65  | `test/e2e-journeys`       | Playwright on three critical journeys                               |
| 66  | `perf/ingest-throughput`  | Heartbeat write benchmark, index tuning, before and after numbers   |
| 67  | `build/single-executable` | Single executable build with Node SEA                               |
| 68  | `feat/first-run`          | First run experience: open the interface, display the pairing token |
| 69  | `build/extension-package` | Extension packaged as a release artifact                            |
| 70  | `ci/release`              | Release workflow and versioning                                     |
| 71  | `docs/readme`             | Final README: purpose, install, screenshots, architecture diagram   |
| 72  | `chore/v1`                | Version 1.0.0 and changelog                                         |

## After version 1

Mobile capture, television and set top boxes, music tracking, multi user mode,
optional server mode with Postgres and Docker, Trakt and Simkl two way sync,
recommendations based on real viewing history.
