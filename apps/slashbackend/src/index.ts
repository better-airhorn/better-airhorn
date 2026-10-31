import { Usage } from '@better-airhorn/entities';
import { createLogger } from '@better-airhorn/structures';
import { BunServer, SlashCreator } from 'slash-create';
import { commands } from './commands';
import { db, recordVote } from './db';
import { env, voice } from './env';
import { handleComponent, handleModal } from './interactions';
import { replyError } from './respond';
import { checkTopggVote } from './topgg';

const log = createLogger('slashbackend');

await db.initialize();
log.info('database ready, migrations applied');

const creator = new SlashCreator({
	applicationID: env.appId,
	publicKey: env.publicKey,
	token: env.token,
	allowedMentions: { everyone: false, roles: false, users: false },
});
const interactions = new BunServer();
creator.withServer(interactions);
creator.registerCommands(commands);

creator.on('commandRun', (command, _result, ctx) => {
	Usage.insert({
		command: command.commandName,
		user: ctx.user.id,
		guild: ctx.guildID ?? null,
		args: JSON.stringify(ctx.options),
	}).catch(err => log.warn('could not record usage', err));
});
creator.on('componentInteraction', ctx => {
	handleComponent(ctx).catch(err => replyError(ctx, err, `component ${ctx.customID}`));
});
creator.on('modalInteraction', ctx => {
	handleModal(ctx).catch(err => replyError(ctx, err, `modal ${ctx.customID}`));
});
creator.on('error', err => log.error('slash-create error', err));
creator.on('warn', warning => log.warn(String(warning)));
creator.on('debug', message => log.debug(message));

async function topggVote(req: Request): Promise<Response> {
	// the v1 signature covers the body exactly as sent, so it is read as text before parsing
	const check = checkTopggVote(req.headers, await req.text(), env.topgg);
	if (!check.ok) {
		log.warn(`top.gg webhook rejected with ${check.status} (trace ${req.headers.get('x-topgg-trace') ?? 'none'})`);
		return new Response(null, { status: check.status });
	}
	if (check.isVote) await recordVote(check.user);
	log.info(`top.gg ${check.event} from ${check.user}`);
	return new Response(null, { status: 204 });
}

const server = Bun.serve({
	port: env.port,
	routes: {
		// the endpoint configured in the Discord developer portal
		'/interactions': { POST: req => interactions.fetch(req) },
		'/health': {
			GET: async () => new Response(null, { status: db.isInitialized && (await voice.health()) ? 200 : 503 }),
		},
		'/votes/topgg': { POST: topggVote },
	},
	fetch: () => new Response('not found', { status: 404 }),
	error: err => {
		log.error('request failed', err);
		return new Response('internal error', { status: 500 });
	},
});
log.info(`listening on :${server.port}`);
if (!env.topgg.v1 && !env.topgg.v0) {
	log.warn('neither TOPGG_WEBHOOK_SECRET nor BOTLISTS_DBL_SECRET is set; /votes/topgg rejects every request');
}

creator.syncCommands({ deleteCommands: true }).then(
	() =>
		log.info(env.devGuildIds.length ? `commands synced to ${env.devGuildIds.join(', ')}` : 'commands synced globally'),
	err => log.error('command sync failed', err),
);

let stopping = false;
async function shutdown(signal: string) {
	if (stopping) return;
	stopping = true;
	log.info(`${signal} received, shutting down`);
	setTimeout(() => process.exit(0), 10_000).unref();
	await server.stop();
	await db.destroy();
	process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
