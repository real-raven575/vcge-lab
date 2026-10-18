# Flight Deck

The lab's front page when one web server holds several teams' projects. Each team gets its own space and the
Flight Deck links to all of them.

| What | Where (raven575's lab) |
|---|---|
| Flight Deck, one tile per team | `/` serves `/srv/dataprojects/portal/www` (static files from `www/`, no services) |
| A team's pages | `/<team>/` serves `/srv/dataprojects/<team>/www`, e.g. `/vcge/` |
| A team's web routes | one file per team, `/etc/caddy/teams/<team>.caddy`, imported by the Caddyfile |
| A team's services | its own service user, its own block of ports, listening on 127.0.0.1 (see `PORTS.md.example`) |

`caddy/Caddyfile` is the front door and `caddy/teams/vcge.caddy` is the vCGE lab's file. Its tools work unchanged
under `/vcge/` because every link in them is relative. The vCGE addresses from before the move (`/v/`, `/b/`,
`/latest/`, `/bench/`, `/testing/`, `/reset.html`) get a 308 redirect to the same address under `/vcge/`. A 308 keeps
the method, so a page left open on an old address can still save.

Change the paths to your own lab's before you use these files. The versions page shows a "Flight Deck" link back to
`/` once `<LAB_ROOT>/../portal/www` exists.

**One origin for everyone.** Browsers keep saved data per address, not per folder, so every team on the deck shares
one origin. The vCGE lab's Start fresh clears what any team's pages saved on it. A team that needs its own storage
should get its own address, for example its own HTTPS port.
