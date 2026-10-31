# Statistics dashboard

Grafana with one provisioned dashboard on the bot database. Everything is in this folder, so the dashboard can be
changed by editing a file and needs no clicking in the UI.

| Path                                             | What it is                                                     |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `docker-compose.grafana.yml`                     | the `grafana` service to add to the production stack           |
| `grafana-readonly-role.sql`                      | creates the `grafana_ro` login that Grafana uses               |
| `grafana/provisioning/datasources/postgres.yml`  | the Postgres data source (uid `better-airhorn-pg`)             |
| `grafana/provisioning/dashboards/dashboards.yml` | loads every JSON file in `grafana/dashboards`                  |
| `grafana/dashboards/better-airhorn.json`         | the dashboard: panels and their SQL                            |
| `test/`                                          | local test stack, fake data, and a check that runs every query |

## Deploy

Commands assume the production layout: `~/composes/better-airhorn.yml` and `env/better-airhorn.env`.

1. Add two values to the env file: `GRAFANA_ADMIN_PASSWORD` (the `admin` login) and `GRAFANA_DB_PASSWORD` (the
   database role). Use long random strings.
2. Create the database role. It can only read, its queries stop after 15 seconds, and it can't see the stray
   Metabase `setting` table in the bot database. Running it again only resets the password.

   ```sh
   docker compose -f better-airhorn.yml --env-file env/better-airhorn.env exec -T postgres \
     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
     -v password="$(grep '^GRAFANA_DB_PASSWORD=' env/better-airhorn.env | cut -d= -f2-)" \
     < monitoring/grafana-readonly-role.sql
   ```

   The SQL file must be on the server for this; copy it along with `grafana/` in step 3.

3. Copy this folder's `grafana/` to `~/composes/monitoring/grafana/` (the volume paths are relative to the compose
   file), and add the `grafana` service from `docker-compose.grafana.yml` under `services:`.
4. `docker compose -f better-airhorn.yml --env-file env/better-airhorn.env up -d grafana`

Grafana keeps no data volume. The data source and dashboard are provisioned on every start, and the admin password
comes from the env file each time the container is recreated.

The panels in the "Plays" row and "House rules (v5.1)" need the v5.1 migration (the `plays` and `blocked_sounds`
tables, the house-rule columns). Before slashbackend has run it, those panels show "relation does not exist" and
the rest of the dashboard works. Days before the first row in `plays` are counted from the `/play` and `/random`
commands in `usages`, so the charts have history from the start.

## Open it

Grafana listens on `127.0.0.1:3389` on the server only. Open an SSH tunnel and browse to http://localhost:3389:

```sh
ssh -N -L 3389:127.0.0.1:3389 clemensNatalis
```

Log in as `admin` with `GRAFANA_ADMIN_PASSWORD`. Anonymous access and sign-up are off. After 5 wrong passwords the
login is locked for 5 minutes.

## Change a panel

1. Edit `grafana/dashboards/better-airhorn.json`. Each panel's SQL is in `targets[].rawSql`; its position is
   `gridPos` on a 24-column grid. Time series use `$__timeGroupAlias("createdAt", 1d, 0)` and
   `$__timeFilter("createdAt")` so they follow the time picker. Timestamps in the database are UTC.
2. Run the local test below; it fails on any query error.
3. Copy the file to the server. Grafana reloads it within 30 seconds; `docker compose ... restart grafana` does it
   at once.

Edits made in the Grafana UI can't be saved over a provisioned dashboard. To keep one, use "Export as JSON" and paste
it into the file.

Keep queries cheap. `usages` (about 130,000 rows) has no index on `createdAt`, so every query on it reads the whole
table; that takes about 25 ms today. `plays` has indexes on `(guild, "createdAt")`, `(user, "createdAt")` and
`soundId`, but none on `"createdAt"` alone.

## Test locally

Needs Docker and bun. Run from the repository root:

```sh
docker compose -f monitoring/test/compose.yml --env-file monitoring/test/test.env up -d --wait postgres
(cd apps/slashbackend && bun -e "const { createDataSource } = await import('@better-airhorn/entities'); const ds = createDataSource('postgresql://postgres:test@127.0.0.1:55432/postgres', { migrationsRun: true }); await ds.initialize(); await ds.destroy();")
docker exec -i airhorn-monitoring-test-postgres-1 psql -q -U postgres -d postgres < monitoring/test/seed.sql
docker exec -i airhorn-monitoring-test-postgres-1 psql -q -U postgres -d postgres -v password=test < monitoring/grafana-readonly-role.sql
docker compose -f monitoring/test/compose.yml --env-file monitoring/test/test.env up -d --wait grafana
bun monitoring/test/check-panels.ts
```

The check prints rows and the last value per panel and exits 1 if a query fails. Grafana is on
http://localhost:3389 (`admin` / `test`). To see the fallback to `usages`, empty the plays log with
`docker exec airhorn-monitoring-test-postgres-1 psql -U postgres -c 'truncate plays'` and run the check again.

Clean up with `docker compose -f monitoring/test/compose.yml --env-file monitoring/test/test.env down -v`.
