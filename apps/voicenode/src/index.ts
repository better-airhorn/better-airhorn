import { createDataSource } from '@better-airhorn/entities';
import { createLogger } from '@better-airhorn/structures';
import { generateDependencyReport } from '@discordjs/voice';
import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { mkdir } from 'node:fs/promises';
import { loadConfig } from './env';
import { createServer } from './http';
import { createVoice } from './voice';

const log = createLogger('voicenode');

let config: ReturnType<typeof loadConfig>;
try {
	config = loadConfig();
} catch (err) {
	log.error((err as Error).message);
	process.exit(1);
}

log.debug(`voice dependencies\n${generateDependencyReport()}`);
await mkdir(config.soundsDir, { recursive: true });

// slashbackend runs the migrations
const dataSource = createDataSource(config.databaseUrl, { migrationsRun: false });
// Discord requires sharding beyond 2,500 guilds; 'auto' runs the recommended shard count in this process
const client = new Client({ shards: 'auto', intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const voice = createVoice(client, config.soundsDir);

/** custom status lines shown under the bot's name, rotated so members discover the newer commands */
const statusLines = [
	'New: pin a soundboard with /panel',
	'New: entrance sounds with /entrance',
	'New: /export a sound to your server soundboard',
	'New: right-click a voice message to save it as a sound',
	'Upload your own sounds with /upload',
];
let statusIndex = 0;
function rotateStatus() {
	if (!client.isReady()) return;
	const state = statusLines[statusIndex++ % statusLines.length];
	client.user.setPresence({ activities: [{ type: ActivityType.Custom, name: 'status', state }] });
}

client.once(Events.ClientReady, c => {
	log.info(`logged in as ${c.user.tag}`);
	rotateStatus();
});
client.on(Events.VoiceStateUpdate, (old, next) =>
	voice.onVoiceStateUpdate(old, next).catch(err => log.error('voice state update failed', err)),
);
client.on(Events.Error, err => log.error('discord client error', err));

const sweeper = setInterval(() => voice.sweep(), 60_000);
const statusRotation = setInterval(rotateStatus, 10 * 60_000);

/** keeps the server count on the top.gg listing current */
async function postTopggStats(token: string) {
	if (!client.isReady()) return;
	const res = await fetch(`https://top.gg/api/bots/${client.user.id}/stats`, {
		method: 'POST',
		headers: { authorization: token, 'content-type': 'application/json' },
		body: JSON.stringify({ server_count: client.guilds.cache.size }),
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) throw new Error(`top.gg answered ${res.status}`);
}
if (config.topggToken) {
	client.once(Events.ClientReady, () =>
		postTopggStats(config.topggToken!).catch(err => log.warn('could not post top.gg stats', err)),
	);
}
const topggStats = config.topggToken
	? setInterval(
			() => postTopggStats(config.topggToken!).catch(err => log.warn('could not post top.gg stats', err)),
			30 * 60_000,
		)
	: undefined;
const server = createServer(
	{
		accessKey: config.accessKey,
		soundsDir: config.soundsDir,
		client,
		isDatabaseReady: () => dataSource.isInitialized,
		voice,
	},
	config.port,
);
log.info(`listening on ${server.port}`);

/** a failed start exits with one clear log line; the restart policy decides whether to try again */
function fatal(message: string): (err: unknown) => never {
	return err => {
		log.error(message, err);
		process.exit(1);
	};
}

await dataSource.initialize().catch(fatal('could not connect to the database'));
await client.login(config.discordToken).catch(fatal('Discord login failed, check DISCORD_TOKEN'));

async function shutdown(signal: string) {
	log.info(`${signal} received, shutting down`);
	clearInterval(sweeper);
	clearInterval(statusRotation);
	clearInterval(topggStats);
	await server.stop(true);
	voice.destroyAll();
	await client.destroy();
	await dataSource.destroy();
	process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
