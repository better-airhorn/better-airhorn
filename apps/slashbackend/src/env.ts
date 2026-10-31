import { createVoiceNode } from './voicenode';

const missing: string[] = [];

function required(name: string): string {
	const value = process.env[name];
	if (!value) missing.push(name);
	return value ?? '';
}

const list = (value: string | undefined) =>
	(value ?? '')
		.split(',')
		.map(v => v.trim())
		.filter(Boolean);

function databaseUrl(): string {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	if (process.env.POSTGRES_PASSWORD)
		return `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@postgres:5432/postgres`;
	missing.push('DATABASE_URL (or POSTGRES_PASSWORD)');
	return '';
}

export const env = {
	appId: required('DISCORD_APP_ID'),
	publicKey: required('DISCORD_PUBLIC_KEY'),
	token: required('DISCORD_TOKEN'),
	voicenodeUrl: (process.env.VOICENODE_URL || 'http://voicenode:8888').replace(/\/$/, ''),
	voicenodeKey: required('VOICENODE_ACCESS_KEY'),
	/** top.gg webhook secrets: v1 is the `whs_` signing secret, v0 the legacy Authorization value */
	topgg: { v1: process.env.TOPGG_WEBHOOK_SECRET ?? '', v0: process.env.BOTLISTS_DBL_SECRET ?? '' },
	port: Number(process.env.PORT || 8080),
	devGuildIds: list(process.env.DEV_GUILD_IDS),
	adminIds: list(process.env.ADMIN_IDS ?? '196214245770133504,329651188641431574'),
	databaseUrl: databaseUrl(),
};

if (missing.length) {
	console.error(`slashbackend: missing required environment variables: ${missing.join(', ')}`);
	process.exit(1);
}

export const voice = createVoiceNode(env.voicenodeUrl, env.voicenodeKey);
