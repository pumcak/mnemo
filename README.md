# Mnemo

[![CI](https://github.com/pumcak/mnemo/actions/workflows/ci.yml/badge.svg)](https://github.com/pumcak/mnemo/actions/workflows/ci.yml)

Mnemo keeps track of what you watch, automatically. It runs on your own machine,
listens to the video players you already use, and turns them into a single
viewing history you can actually browse.

The point is that you never type anything. No marking an episode as seen, no
importing a list. You watch, Mnemo notices.

## Status

Early development. Nothing is usable yet. The build order is in
[ROADMAP.md](ROADMAP.md).

## How it works

Three capture sources feed one local service:

- A browser extension follows real playback inside the page, so it works on
  Netflix and Crunchyroll as well as on unofficial players.
- A Windows sidecar reads the system media session, which covers desktop players
  such as the Netflix app, VLC, MPV and Plex without writing one connector per
  application.
- Optional adapters talk directly to VLC, MPV, Plex and Jellyfin for the cases
  the two above cannot see.

What those sources report is messy. A raw title like
`One.Piece.S01E1071.VOSTFR.1080p` has to become one exact work, season and
episode, so the service resolves titles against TMDB and AniList with a
confidence score. Anything below the threshold lands in a review queue instead
of being silently wrong, and every correction is remembered.

Everything stays local. The service listens on the loopback interface only, the
database is a file on your disk, and the extension reports a tab only while a
video is actually playing.

## Stack

TypeScript everywhere: a Node service with Hono, SQLite for storage, a
WebExtension built with WXT, and a React interface served by the local service.
The Windows capture sidecar is written in C# because that is where the system
media API lives.

## Install

Not available yet. This section gets filled in when the first release ships.

## License

MIT
