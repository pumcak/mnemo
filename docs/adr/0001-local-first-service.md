# 0001. Run as a local first service

Status: accepted
Date: 2026-09-17

## Context

Mnemo has to observe playback where playback happens. Two of its three capture
paths are only reachable from the machine itself: a browser extension can only
talk to something on the same host, and the Windows media session is an
operating system API, not a network service.

The data involved is a complete history of what someone watches, including what
they watch on players they would rather not discuss. That is about as personal
as a dataset gets.

There is one user per installation, and the working set is small: a few
heartbeats per minute at most, a few thousand works at most.

## Decision

Mnemo runs as one local process. It listens on the loopback interface only,
stores everything in a SQLite file on the user's disk, and serves its interface
on that same port. No account, no server, no data leaving the machine.

## Consequences

Setup is running one executable. Nothing to provision, no database service, no
credentials to hold.

The viewing history cannot leak from a service that does not exist. The privacy
question stops being a policy promise and becomes a property of the
architecture.

Listening on loopback is not the same as being safe: any page open in the
browser can send requests to localhost. The service therefore generates a token
on first run, the extension pairs with it once, every request carries it, and
CORS is restricted to the extension origin.

Two machines do not share a history yet. That needs a sync design, and it is
deliberately out of scope for the first version.

Showing the project to someone else means either a screen recording or a
separate server mode. The data access layer stays behind interfaces so that a
hosted mode with a different database remains possible without a rewrite.

## Alternatives considered

A hosted service with user accounts. Rejected: it cannot read desktop players at
all, which removes a third of the product, and it turns a private history into
someone else's database.

Storing everything inside the browser extension. Rejected: it cannot see desktop
applications either, extension storage is the wrong place for a few hundred
thousand rows, and there is no room for a resolver or for real queries.
