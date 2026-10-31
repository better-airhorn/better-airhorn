-- Read-only login for Grafana on the bot database. Run once as postgres, with the password from the env file:
--   docker compose ... exec -T postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -v password="$GRAFANA_DB_PASSWORD" < grafana-readonly-role.sql
-- Re-running it only resets the password and the grants.

SELECT format('CREATE ROLE grafana_ro LOGIN PASSWORD %L', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafana_ro') \gexec
ALTER ROLE grafana_ro PASSWORD :'password';

-- every session of this role is read-only, short, and few
ALTER ROLE grafana_ro SET default_transaction_read_only = on;
ALTER ROLE grafana_ro SET statement_timeout = '15s';
ALTER ROLE grafana_ro CONNECTION LIMIT 5;

GRANT CONNECT ON DATABASE postgres TO grafana_ro;
GRANT USAGE ON SCHEMA public TO grafana_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_ro;
-- tables the migrations create later (plays, blocked_sounds, ...) are readable too
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO grafana_ro;

-- `setting` is a stray Metabase table in the bot database (site URL, admin email); the dashboards don't need it
SELECT 'REVOKE SELECT ON public.setting FROM grafana_ro' WHERE to_regclass('public.setting') IS NOT NULL \gexec
