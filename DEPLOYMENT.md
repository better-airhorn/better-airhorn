# Deployment

Production runs as one Docker Compose stack (`docker-compose.yml`) on a single host:

| Service        | Purpose                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slashbackend` | Discord interactions (`POST /interactions`), top.gg votes (`POST /votes/topgg`), `GET /health`, port 8080. Runs database migrations on startup. On the `nexternal` network for the reverse proxy. |
| `voicenode`    | Discord gateway and voice, stores sounds as `<id>.ogg` in `/data/sounds`, port 8888.                                                                                                              |
| `postgres`     | PostgreSQL 17 with the `postgres` (bot) and `metabase` databases.                                                                                                                                 |
| `pgbackups`    | Dumps both databases every 5 hours to `${BACKUP_ROOT}/postgres`; see [Backups](#backups) for retention.                                                                                           |
| `uptime-proxy` | Health monitors for postgres, voicenode and slashbackend.                                                                                                                                         |
| `metabase`     | Statistics on `127.0.0.1:3388` (reach it through an SSH tunnel or the reverse proxy).                                                                                                             |

Host folders:

| Path                      | Content                              | Owner                             |
| ------------------------- | ------------------------------------ | --------------------------------- |
| `${DATA_ROOT}/pgsql17`    | PostgreSQL 17 data                   | set by the postgres image         |
| `${DATA_ROOT}/sounds`     | sound files, `<id>.ogg`              | `1000:1000` (the `bun` user)      |
| `${DATA_ROOT}/stats`      | metabase                             | unchanged                         |
| `${BACKUP_ROOT}/postgres` | pgbackups dumps                      | `999:999` (postgres in pgbackups) |
| `${BACKUP_ROOT}/sounds`   | sounds mirror (host cron, see below) | `1000:1000`                       |

`DATA_ROOT` defaults to `/srv/better-airhorn`, `BACKUP_ROOT` to `/mnt/backup/better-airhorn`.
Every variable is documented in [`.env.example`](./.env.example).

```sh
docker compose --env-file ./env/better-airhorn.env up -d --build
```

## Backups

| What                   | How                                        | Kept                                              |
| ---------------------- | ------------------------------------------ | ------------------------------------------------- |
| `postgres`, `metabase` | `pgbackups`, every 5 hours                 | 7 days of dumps, plus 4 weekly and 6 monthly ones |
| sound files            | host cron, nightly `rsync --delete` mirror | a deleted sound leaves the mirror on the next run |

pgbackups (`BACKUP_KEEP_DAYS=7`, `BACKUP_KEEP_WEEKS=4`, `BACKUP_KEEP_MONTHS=6`) removes a monthly dump once it is
188 days old, checked on every 5-hour run, so every dump is gone at most **189 days** after it was taken. The
[Privacy Policy](./Privacy%20Policy.md) promises exactly this: deleted data leaves the backups within 189 days.
Changing the retention, keeping extra copies, or skipping `--delete` breaks that promise; update the policy first.

### Sounds mirror

Sound files are written once and never modified, so a mirror is enough. Add a host cron job, e.g.
`/etc/cron.d/better-airhorn-sounds`:

```cron
30 4 * * * clemens [ -n "$(ls -A /srv/better-airhorn/sounds)" ] && rsync -a --delete /srv/better-airhorn/sounds/ /mnt/backup/better-airhorn/sounds/
```

`--delete` makes sounds deleted in the bot leave the mirror on the next run. The `ls -A` guard skips the run when
the sounds folder is empty (e.g. the data disk is not mounted), so a missing source never wipes the mirror. To
recover a deleted sound, copy it out of the mirror before 04:30 the next night.

---

## Upgrade runbook: v4 → v5

v5 drops Redis, Meilisearch, MinIO and the voteserver, stores sounds as plain files and moves Postgres from 14 to 17.
Every new folder is created next to the old ones and nothing old is modified, so rollback is "start the old compose
file again".

Commands below assume you are in the deployment directory, `DATA_ROOT=/srv/better-airhorn`,
`BACKUP_ROOT=/mnt/backup/better-airhorn`, and the env file at `./env/better-airhorn.env`:

```sh
export DATA_ROOT=/srv/better-airhorn BACKUP_ROOT=/mnt/backup/better-airhorn
ENV=./env/better-airhorn.env
```

Expect around 30 minutes of downtime, most of it spent copying sounds.

### 0. Prepare (no downtime)

1. Save the running v4 compose file: `cp docker-compose.yml docker-compose.v4.yml`. All v4 commands below use it.
2. Check out v5 (`git fetch && git checkout v5`, or copy the new `docker-compose.yml`, `apps/`, `packages/`,
   `scripts/`, `package.json`, `bun.lock`, `tsconfig.json` into place).
3. Build the images ahead of time: `docker compose --env-file $ENV build`.
4. Check the running Metabase version (Admin → Troubleshooting, or
   `docker compose -f docker-compose.v4.yml --env-file $ENV exec metabase cat /app/version.properties`). Metabase
   cannot downgrade its database, so if it is newer than the tag in `docker-compose.yml`, raise the tag to at least that version.
5. Add to the env file (keep the `MINIO_*` variables until step 3 is done):
   - `ADMIN_IDS` only if the admins differ from the built-in owner ids (see `.env.example`)
   - `LOG_LEVEL=info`
   - `DATA_ROOT` / `BACKUP_ROOT` if they differ from the defaults
   - `BOTLISTS_DBL_SECRET` stays; it is the `Authorization` value top.gg sends.
   - `BOTLISTS_TOPGG` stays; voicenode uses it to post the server count to top.gg.

### 1. Full backups (stack still running)

The v4 pgbackups container is not producing backups, so dump straight from Postgres instead:

```sh
# roles plus the postgres and metabase databases
docker compose -f docker-compose.v4.yml --env-file $ENV exec -T postgres pg_dumpall -U postgres | gzip > $BACKUP_ROOT/v4-predeploy-$(date +%F).sql.gz
gunzip -c $BACKUP_ROOT/v4-predeploy-*.sql.gz | grep -c 'CREATE TABLE'   # non-zero, roughly the table count
```

### 2. Stop the stack and take a cold copy

```sh
docker compose -f docker-compose.v4.yml --env-file $ENV down
sudo tar -C "$(dirname $DATA_ROOT)" -czf $BACKUP_ROOT/v4-final-$(date +%F).tar.gz "$(basename $DATA_ROOT)"
```

Check the archive size is plausible (`ls -lh $BACKUP_ROOT/v4-final-*`) before continuing.

### 3. Export the sounds from MinIO

Start the old MinIO and Postgres 14 alone (nothing else touches them from here on):

```sh
docker compose -f docker-compose.v4.yml --env-file $ENV up -d minio postgres
sudo install -d -o 1000 -g 1000 $DATA_ROOT/sounds
```

Copy every object to `$DATA_ROOT/sounds/<id>.ogg` with [`scripts/migrate-minio.ts`](./scripts/migrate-minio.ts),
inside the bun image so the host needs no bun install. It shares MinIO's network namespace, so MinIO is `localhost`:

```sh
docker run --rm --user 1000:1000 \
  --network container:$(docker compose -f docker-compose.v4.yml --env-file $ENV ps -q minio) \
  --env-file $ENV -e MINIO_ENDPOINT=http://localhost:9000 \
  -v "$PWD/scripts:/scripts:ro" -v "$DATA_ROOT/sounds:/data/sounds" \
  oven/bun:1.3.5-slim bun /scripts/migrate-minio.ts
```

It reads `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` and `MINIO_BUCKETNAME` from the env file, prints progress per 1000
objects and a final `done: <copied> copied, <skipped> skipped, <failed> failed`, lists every failed key and exits
non-zero if any failed. It is idempotent: re-running skips files that already exist with the right size, so just run
it again after fixing a failure. `docker run --env-file` takes values literally, so if the env file quotes them,
pass the three `MINIO_*` variables with `-e` instead. Compare the final count with the database later (step 6).

**Plain-copy alternative.** MinIO stores objects as plain files only in its legacy single-drive "FS" mode. Check:

```sh
sudo cat $DATA_ROOT/minio/.minio.sys/format.json
```

- `"format":"fs"`: `$DATA_ROOT/minio/<bucket>/<id>` are the raw sound files, and a copy works too:
  `cd $DATA_ROOT/minio/<bucket> && for f in *; do sudo install -o 1000 -g 1000 -m 644 "$f" "$DATA_ROOT/sounds/$f.ogg"; done`
- `"format":"xl-single"` or `"xl"`: objects are `<bucket>/<id>/xl.meta` (small files are inlined into it, larger ones
  sit in `<id>/<uuid>/part.1`). These are not plain files; use the script.

`RELEASE.2022-06-03T01-40-53Z` formats a new, empty drive as `xl-single` (verified on a fresh test volume); a volume
first created by an older MinIO release keeps the `fs` format.

### 4. Postgres 14 → 17

Dump everything (roles, `postgres` and `metabase` databases) from the old container, then stop the v4 services:

```sh
docker compose -f docker-compose.v4.yml --env-file $ENV exec -T postgres pg_dumpall -U postgres > $BACKUP_ROOT/v4-pg14-dumpall.sql
docker compose -f docker-compose.v4.yml --env-file $ENV down
```

Start the new Postgres 17 alone. `$DATA_ROOT/pgsql17` must not exist yet; the image initialises it with
`POSTGRES_PASSWORD`. The old `$DATA_ROOT/pgsql` is left untouched.

```sh
docker compose --env-file $ENV up -d postgres
docker compose --env-file $ENV exec -T postgres psql -U postgres -d postgres < $BACKUP_ROOT/v4-pg14-dumpall.sql 2>&1 | grep -i error
```

The only expected error is `role "postgres" already exists`. Spot-check:

```sh
docker compose --env-file $ENV exec postgres psql -U postgres -c '\l' -c 'select count(*) from sound_commands'
```

### 5. First v5 start

Start `slashbackend` first: it runs the database migrations on startup, and the rest of the stack should only start
once they are through.

```sh
docker compose --env-file $ENV up -d slashbackend
docker compose --env-file $ENV logs -f slashbackend   # wait for the migrations and the listening message
docker compose --env-file $ENV up -d
docker compose --env-file $ENV ps                     # everything (healthy)
```

Then the external routes:

- **Interactions**: unchanged, `https://<domain>/interactions` → `slashbackend:8080` on `nexternal`. No change in the
  Discord Developer Portal. slashbackend no longer publishes host port 1212; if the reverse proxy reached it through
  that port, point it at `slashbackend:8080` on `nexternal` (or add `ports: ["127.0.0.1:1212:8080"]`).
- **top.gg votes**: the voteserver (`voteserver:7777`) is gone. Route the vote path to `slashbackend:8080`
  `POST /votes/topgg` in the reverse proxy, then on top.gg (bot page → Edit → Webhooks) set the webhook URL to
  `https://<domain>/votes/topgg`, keep the Authorization value equal to `BOTLISTS_DBL_SECRET`, and press "Test".
- **uptime-proxy**: no longer publishes host port 7778; it is on `nexternal` like slashbackend. Update the proxy
  route and the external uptime monitor if they used the port. Monitors are now `postgres`, `voicenode`,
  `slashbackend`.

### 6. Verification checklist

- [ ] `docker compose --env-file $ENV ps`: slashbackend, voicenode and postgres `healthy`, nothing restarting.
- [ ] `docker compose --env-file $ENV logs slashbackend` shows the migrations ran without errors.
- [ ] The schema matches the v5 entities: the [schema check](#schema-check) prints `schema matches`.
- [ ] Sound count matches: `ls $DATA_ROOT/sounds | wc -l` vs.
      `docker compose --env-file $ENV exec postgres psql -U postgres -tc 'select count(*) from sound_commands'`
      (files may exceed rows if v4 left orphans; fewer files means missing sounds).
- [ ] Discord Developer Portal → General Information → "Save Changes" on the unchanged interactions URL succeeds
      (Discord sends a signed PING).
- [ ] In a server: an old sound plays in voice, a new upload works and plays, a like is saved.
- [ ] top.gg webhook "Test" shows up in `docker compose --env-file $ENV logs slashbackend`.
- [ ] Metabase on `127.0.0.1:3388` loads its dashboards (its own database came over with `pg_dumpall`; repoint its
      data source if it was configured with something other than host `postgres`).
- [ ] Backups work: `sudo install -d -o 999 -g 999 $BACKUP_ROOT/postgres` (the container writes as uid 999 and fails
      silently on a root-owned folder), then `docker compose --env-file $ENV exec pgbackups /backup.sh` writes
      dumps for `postgres` and `metabase` to `$BACKUP_ROOT/postgres/last/`, and `docker compose ps` shows
      `pgbackups` as `healthy` (its healthcheck fails when the last scheduled backup failed).
- [ ] uptime-proxy reports all three monitors up.
- [ ] Sounds cron is installed (see [Sounds mirror](#sounds-mirror)); run it once by hand.

### Schema check

Compares the live database with the v5 entities, to catch hand-made changes in production that a clean v4 schema
does not have. It only reads; nothing is applied.

```sh
docker compose --env-file $ENV exec slashbackend bun -e "const { createDataSource } = await import('@better-airhorn/entities'); const ds = createDataSource(process.env.DATABASE_URL ?? 'postgresql://postgres:' + process.env.POSTGRES_PASSWORD + '@postgres:5432/postgres', { migrationsRun: false }); await ds.initialize(); const { upQueries } = await ds.driver.createSchemaBuilder().log(); console.log(upQueries.map(q => q.query).join('\n') || 'schema matches'); await ds.destroy();"
```

Any printed statement is a difference; review it before running anything.

### Rollback

Nothing from v4 was modified (`pgsql`, `minio`, the redis and meili folders are untouched), so:

```sh
docker compose --env-file $ENV down
docker compose -f docker-compose.v4.yml --env-file $ENV up -d
```

Revert the reverse-proxy routes and the top.gg webhook URL. Uploads, likes and votes made while v5 was running are
not carried back.

### Cleanup (once v5 runs without problems, within 189 days)

1. Remove from the env file: `REDIS_PASSWORD`, `MEILI_MASTER_KEY`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`,
   `MINIO_BUCKETNAME`, `NORMAL_COMMANDS_DEADLINE` and the unused `BOTLISTS_*` tokens (keep `BOTLISTS_DBL_SECRET` and `BOTLISTS_TOPGG`).
2. Delete the old folders under `$DATA_ROOT`: `pgsql`, `minio`, `databases` (redis), `meili`, and the old MinIO
   backups in `$BACKUP_ROOT/minio`.
3. Delete `$BACKUP_ROOT/v4-predeploy-*.sql.gz`, `v4-final-*.tar.gz` and `v4-pg14-dumpall.sql`, and any copies.
4. `rm docker-compose.v4.yml` and `docker image prune -a` to drop the old images.

Do steps 2 and 3 **no later than 189 days after the upgrade**. These copies still hold data that users delete in v5,
and the [Privacy Policy](./Privacy%20Policy.md) promises that deleted data leaves every backup within 189 days.
