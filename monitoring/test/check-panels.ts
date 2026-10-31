// Runs every panel query of the dashboard through Grafana's /api/ds/query and prints rows or the error per panel.
// Exits 1 when any query fails. GRAFANA_URL and GRAFANA_AUTH ("user:password") default to the local test stack.
//   bun monitoring/test/check-panels.ts
import dashboard from '../grafana/dashboards/better-airhorn.json';

const url = process.env.GRAFANA_URL ?? 'http://127.0.0.1:3389';
const auth = `Basic ${btoa(process.env.GRAFANA_AUTH ?? 'admin:test')}`;

type Frame = { schema?: { fields: { name: string }[] }; data?: { values: unknown[][] } };
let failed = 0;

for (const panel of dashboard.panels) {
	if (!('targets' in panel) || !panel.targets) continue;
	const from = 'timeFrom' in panel && panel.timeFrom ? `now-${panel.timeFrom}` : dashboard.time.from;
	const started = performance.now();
	const res = await fetch(`${url}/api/ds/query`, {
		method: 'POST',
		headers: { Authorization: auth, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			from,
			to: 'now',
			queries: panel.targets.map(t => ({ ...t, intervalMs: 86_400_000, maxDataPoints: 500 })),
		}),
	});
	const ms = Math.round(performance.now() - started);
	const body = (await res.json()) as {
		results?: Record<string, { error?: string; frames?: Frame[] }>;
		message?: string;
	};
	for (const [refId, result] of Object.entries(
		body.results ?? { A: { error: body.message ?? `HTTP ${res.status}` } },
	)) {
		if (result.error) {
			failed++;
			console.log(`FAIL  ${panel.title} [${refId}]: ${result.error}`);
			continue;
		}
		const frames = result.frames ?? [];
		const rows = frames.reduce((n, f) => n + (f.data?.values[0]?.length ?? 0), 0);
		const first = frames[0];
		const sample = first?.schema?.fields
			.map((f, i) => `${f.name}=${JSON.stringify(first.data?.values[i]?.at(-1))}`)
			.join(' ');
		console.log(`ok    ${panel.title} [${refId}] ${frames.length} frame(s), ${rows} row(s), ${ms} ms; last: ${sample}`);
	}
}

if (failed) {
	console.log(`${failed} query(s) failed`);
	process.exit(1);
}
