# Development

## Prerequisites

- [bun](https://bun.sh) 1.3.5 (the version CI and the Docker images use)
- Docker with Compose, for Postgres and the full stack
- `ffmpeg` and `ffprobe` on `PATH`, built with libopus and libmp3lame. The tests and a host-side voicenode need them;
  the voicenode image ships ffmpeg 8.0.1, CI uses Ubuntu's `ffmpeg` package.

## Layout

A bun workspace. Packages are imported as TypeScript source; there is no build step.

| Path                  | Owns                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/slashbackend`   | Discord HTTP interactions (commands, buttons, forms), command sync, top.gg vote webhook, runs the migrations. Port 8080. |
| `apps/voicenode`      | Discord gateway, voice playback and queues, sound files (`<id>.ogg`), soundboard export, top.gg server count. Port 8888. |
| `packages/entities`   | TypeORM entities, `createDataSource`, migrations, and the house rules (`lib/house-rules.ts`).                            |
| `packages/structures` | The slashbackend ↔ voicenode HTTP contract and `createLogger`.                                                           |
| `packages/audio`      | ffmpeg/ffprobe helpers used by voicenode ([README](./packages/audio/README.md)).                                         |
| `scripts/`            | One-off operational scripts (`migrate-minio.ts` for the v4 → v5 upgrade).                                                |
| `monitoring/`         | The Grafana statistics dashboard as code, and a local test stack for it ([README](./monitoring/README.md)).              |

## Commands

```sh
bun install
bun run lint            # eslint
bun run typecheck       # tsc --noEmit
bun run format          # prettier --write .
bun run format:check    # prettier --check .
bun test                # needs ffmpeg/ffprobe, no database
```

CI (`.github/workflows/ci.yml`) runs install, lint, typecheck and test on every push and pull request.

## A Discord app for development

> **Never run a local stack with the production token.** On every start slashbackend syncs the commands and deletes
> every command its code does not define. With `DEV_GUILD_IDS` set, that includes all global commands, so a
> production token would remove every command from the live bot. voicenode would also open a second gateway session
> for the production bot.

1. [Developer Portal](https://discord.com/developers/applications) → New Application.
2. Copy the Application ID and Public Key (General Information) and a bot token (Bot → Reset Token).
3. Invite it to a test server: OAuth2 → URL Generator, scopes `bot` and `applications.commands`, permissions View
   Channels, Send Messages, Connect, Speak, Create Expressions and Manage Expressions (what `/invite` asks for).
4. `cp .env.example .env` and fill in `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_TOKEN`, any
   `VOICENODE_ACCESS_KEY`, and `DEV_GUILD_IDS` with your test server's id. Leave `BOTLISTS_TOPGG` empty.

With `DEV_GUILD_IDS` set, the commands are registered on those servers only, which Discord applies instantly. Guild
commands carry no DM or user-install contexts; to test `/share` in DMs, leave `DEV_GUILD_IDS` empty so the
development app registers global commands.

## Running the stack in Docker

```sh
docker compose -f docker-compose.dev.yml up --build
```

This starts Postgres 17, voicenode, slashbackend and a Cloudflare quick tunnel to slashbackend. Get the public URL:

```sh
docker compose -f docker-compose.dev.yml logs cloudflared | grep trycloudflare.com
```

and set **Interactions Endpoint URL** (General Information) to `https://<name>.trycloudflare.com/interactions`.
Discord verifies the endpoint on save, so slashbackend has to be up.

The tunnel URL changes whenever the `cloudflared` container restarts. To pick up code changes without losing it,
rebuild only the app: `docker compose -f docker-compose.dev.yml up -d --build slashbackend`.

Data lives in the named volumes `pgdata` and `sounds`; `docker compose -f docker-compose.dev.yml down -v` resets it.
Postgres is reachable from the host on `localhost:5432` (user and password `postgres` unless `POSTGRES_PASSWORD` is
set). The dev stack logs at `debug` unless `LOG_LEVEL` is set.

## Running the apps with bun

For `--watch` reloads, run only Postgres in Docker and the apps on the host. Add to `.env`:

```sh
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
VOICENODE_URL=http://localhost:8888
SOUNDS_DIR=./.data/sounds
```

The Docker setup ignores these three, so one `.env` serves both.

```sh
docker compose -f docker-compose.dev.yml up -d postgres
cd apps/voicenode && bun --env-file=../../.env --watch src/index.ts       # terminal 1
cd apps/slashbackend && bun --env-file=../../.env --watch src/index.ts    # terminal 2
```

Run them from the app directory: its `tsconfig.json` extends the root one, which turns on the decorator metadata
TypeORM needs. `SOUNDS_DIR` is relative to that directory.

Tunnel to the host-side slashbackend:

```sh
docker run --rm --add-host host.docker.internal:host-gateway \
  cloudflare/cloudflared:2026.10.0 tunnel --url http://host.docker.internal:8080
```

## The voicenode HTTP contract

slashbackend never talks to the gateway or the sound files; it calls voicenode over HTTP.
[`packages/structures/lib/index.ts`](./packages/structures/lib/index.ts) is the contract: every route is documented
there next to its request and response types.

- Every route except `GET /health` requires the header `authorization: <VOICENODE_ACCESS_KEY>`.
- Errors are a non-2xx status with a `{ code, message }` body, `code` being a `VoiceErrorCode`. voicenode maps codes
  to statuses (`statusFor` in `apps/voicenode/src/http.ts`); slashbackend maps them to user-facing text
  (`voiceErrorMessages` in `apps/slashbackend/src/voicenode.ts`). Both are `Record<VoiceErrorCode, …>`, so a new code
  does not typecheck until both have an entry. `HOUSE_RULE` and `MISSING_PERMISSIONS` are the exceptions: voicenode
  writes their `message` for the member (which rule, or which permissions are missing in which channel), and
  slashbackend shows it as is.
- `POST /guilds/:guild/queue` takes a `source` (`command`, `panel`, `button` or `quiz`) for the plays log.
- Playback is asynchronous: `POST /guilds/:guild/queue` returns a transaction id, which slashbackend long-polls with
  `GET /transactions/:id?until=playing|done` to update the play card. voicenode keeps finished transactions for
  30 minutes.

To add a route: types and doc comment in `packages/structures`, the handler wrapped in `guard` in
`apps/voicenode/src/http.ts`, the client method in `apps/slashbackend/src/voicenode.ts`, and a test in
`apps/voicenode/test/http.test.ts`.

## The plays log

The `plays` table has one row per playback that actually started: sound, server, member, `source` and time. voicenode
writes it in `recordPlay` (`apps/voicenode/src/voice.ts`) once the audio player reports playing, together with the
sound's play count; a database error there is only logged, so playback never waits on it. Sounds that fail or are
skipped before they start leave no row.

| `source`   | Started by                                                   |
| ---------- | ------------------------------------------------------------ |
| `command`  | `/play`, `/random`                                           |
| `panel`    | a panel button                                               |
| `button`   | Play again, the `/list` picker, the Play button after upload |
| `quiz`     | a `/quiz` round                                              |
| `entrance` | a join sound                                                 |
| `exit`     | a leave sound                                                |
| `stream`   | a Go Live sound                                              |

slashbackend sends the first four with the enqueue request; voicenode sets the last three itself from voice state
changes. `/wrapped` and the Grafana dashboard read the log. For time before its first row they count `/play` (and,
in Grafana, `/random`) from `usages` instead, so nothing is counted twice. Deleting a sound deletes its plays
(`ON DELETE CASCADE`), which the Privacy Policy relies on.

## House rules

[`packages/entities/lib/house-rules.ts`](./packages/entities/lib/house-rules.ts) is the one place for rule logic and
wording, used by both apps:

- `brokenHouseRule` returns the first rule that stops a sound for a member (blocked, play role, quiet hours, server
  sounds only, length cap, checked in that order), or null.
- `houseRuleMessage` is the sentence the member reads; `describeHouseRules` gives the lines on the `/config` card.
- `inQuietHours`, `parseClock` and `formatClock` handle quiet hours in the server's IANA time zone, including windows
  past midnight.

voicenode checks the rules on every enqueue and answers `403 HOUSE_RULE` with the member-facing sentence; join,
leave and Go Live sounds that break a rule are skipped. `/quiz` filters its sound pool with the same function. The
settings are columns on `GuildSetting`; blocked sounds are the `BlockedSound` entity. A new rule needs a column, a
case in `brokenHouseRule`, `houseRuleMessage` and `describeHouseRules`, a control in `configCard`
(`apps/slashbackend/src/ui.ts`), and a test in `packages/entities/test/house-rules.test.ts`.

## Hints on play cards

[`apps/slashbackend/src/hints.ts`](./apps/slashbackend/src/hints.ts) holds the extra line under public play cards.
It is pure; `cardHint` in `play.ts` looks up the facts and passes the clock and randomness.

- What's new: `release` and `whatsNewLine`. Each server sees the line once per release; `claimRelease` stores the
  release in `GuildSetting.announcedVersion` atomically, so two cards at once can't both show it. Change both
  constants for the next release.
- Tips: `pickTip` picks one that fits the server and member (no panel yet, no `/entrance` sound of any kind, no quiz in 30 days), and
  `/wrapped` from 1 December to 7 January. `tipDue` allows one per server every 3 hours, on a quarter of the cards.
  The 3-hour cooldown is kept in memory, so a restart resets it.

The bot's status line rotation in `apps/voicenode/src/status.ts` advertises the newer commands the same way.

## Adding a command

1. Write a class extending `Command` (`apps/slashbackend/src/commands/base.ts`) in the matching file under
   `apps/slashbackend/src/commands/`, and add it to the `commands` array in `commands/index.ts`.
2. Spread `guildOnly` for server-only commands; otherwise set `contexts` and `integrationTypes` explicitly (see
   `/share`).
3. Throw `UserError` for anything the user should read. voicenode errors are answered with their mapped text; any
   other error is logged and answered with a generic message. Answers are ephemeral unless the command says
   otherwise.
4. `requiredPermissions` becomes the command's default member permission. Button and select clicks are not covered
   by it, so check permissions in the component handler too (see `toggleSetting`).
5. For a sound option, reuse `soundOption`, `soundChoices` (autocomplete) and `playableSound` (resolves the input
   and enforces visibility).

Every run is recorded in the `usages` table with its options; no extra code is needed.

### Buttons, selects and forms

Components use persistent custom_ids. Panels stay in channels indefinitely, so every button must work after a
restart and long after the 15-minute interaction token is gone:

- Build ids with `buildId` and parse them with `parseId` (`apps/slashbackend/src/ids.ts`); each id encodes what it
  acts on (`play:<soundId>`, `list:<scope>:<page>:<ownerId>`, ...). Discord allows at most 100 characters.
- Handle them in `handleComponent` / `handleModal` (`apps/slashbackend/src/interactions.ts`).
- **Never use slash-create's `registerComponent`.** Its callbacks live in memory and stop working after a restart or
  when the token expires.
- Keep existing id formats parseable. An id `parseId` rejects is answered with "This button is from an older
  version of me".

## Writing a migration

The schema is changed by migrations only (`synchronize` is off). slashbackend runs pending migrations on startup;
voicenode never does, so the two never race.

1. Change the entity in `packages/entities/lib/entities/` (register a new entity in `entities` in `data-source.ts`
   and export it from `lib/index.ts`).
2. Add `packages/entities/lib/migrations/<timestamp>-<Name>.ts` exporting a class named `<Name><timestamp>`, for
   example `V51793404800000` in `1793404800000-V5.ts`. TypeORM 1.x reads the last 13 digits of the class name as a
   millisecond timestamp and refuses to start without it; use `Date.now()` so it sorts after the existing ones.
   Never rename a migration that has run: the name is recorded in the `migrations` table.
3. Append the class to the `migrations` array in `migrations/index.ts`, which is kept in execution order.
4. Write the SQL by hand and keep it cheap on large tables (`usages` is the big one); `1793404800000-V5.ts` sets
   `lock_timeout` and avoids table rewrites.
5. Check the result against the entities with the read-only schema check: start the dev stack so the migration runs,
   then

```sh
docker compose -f docker-compose.dev.yml exec slashbackend bun -e "const { createDataSource } = await import('@better-airhorn/entities'); const ds = createDataSource('postgresql://postgres:' + process.env.POSTGRES_PASSWORD + '@postgres:5432/postgres', { migrationsRun: false }); await ds.initialize(); const { upQueries } = await ds.driver.createSchemaBuilder().log(); console.log(upQueries.map(q => q.query).join('\n') || 'schema matches'); await ds.destroy();"
```

It prints `schema matches`, or the statements TypeORM would run to make the database match the entities. It never
applies anything.

## The statistics dashboard

The Grafana dashboard is a JSON file in `monitoring/grafana/dashboards/`, with the SQL of every panel in it.
[monitoring/README.md](./monitoring/README.md) explains how to change a panel and how to test it locally: a separate
compose project with Postgres on port 55432 and the production `grafana` service, fake data from
`monitoring/test/seed.sql`, and `bun monitoring/test/check-panels.ts`, which runs every panel's query and exits 1 if
one fails. Run it after changing a panel or a table the dashboard reads.

## Logging

Use `createLogger('<module>')` from `@better-airhorn/structures`. It writes one JSON object per line to stdout
(`time`, `level`, `module`, `msg`, plus `err` with message and stack when the second argument is an `Error`, or
`extra` otherwise). `LOG_LEVEL` (`debug`, `info`, `warn`, `error`; default `info`) sets the minimum level.

## Commits

Follow the [commit convention](./.github/COMMIT_CONVENTION.md).
