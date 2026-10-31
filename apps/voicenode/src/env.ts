/** reads the environment once at startup; throws one message naming every missing variable */
export function loadConfig(env: Record<string, string | undefined> = process.env) {
	const missing = ['DISCORD_TOKEN', 'VOICENODE_ACCESS_KEY'].filter(name => !env[name]);
	if (!env.DATABASE_URL && !env.POSTGRES_PASSWORD) missing.push('DATABASE_URL or POSTGRES_PASSWORD');
	if (missing.length) throw new Error(`missing required environment variables: ${missing.join(', ')}`);

	const port = Number(env.PORT ?? 8888);
	if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error(`PORT is not a valid port: ${env.PORT}`);

	return {
		discordToken: env.DISCORD_TOKEN!,
		accessKey: env.VOICENODE_ACCESS_KEY!,
		soundsDir: env.SOUNDS_DIR ?? '/data/sounds',
		port,
		databaseUrl: env.DATABASE_URL ?? `postgresql://postgres:${env.POSTGRES_PASSWORD}@postgres:5432/postgres`,
		/** top.gg API token; the server count is only posted when it is set */
		topggToken: env.BOTLISTS_TOPGG || undefined,
	};
}
