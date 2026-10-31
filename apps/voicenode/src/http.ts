import { encodeMp3Clip, probeDurationMs } from '@better-airhorn/audio';
import {
	createLogger,
	nativeSoundboardLimits,
	VoiceErrorCode,
	type EnqueueRequest,
	type MemberResponse,
	type SkipResponse,
	type SoundboardExportResponse,
	type SoundMetaResponse,
	type UserResponse,
	type VoiceError,
} from '@better-airhorn/structures';
import { DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { VoiceFailure } from './queue';
import { importSound, isAllowedUrl, soundPath } from './sounds';
import { missingPermissionsMessage, type Voice } from './voice';

const log = createLogger('http');

export interface AppDeps {
	accessKey: string;
	soundsDir: string;
	client: Client;
	isDatabaseReady: () => boolean;
	voice: Pick<Voice, 'queue' | 'enqueue' | 'leave'>;
}

const statusFor: Record<VoiceErrorCode, number> = {
	[VoiceErrorCode.GUILD_NOT_FOUND]: 404,
	[VoiceErrorCode.MEMBER_NOT_FOUND]: 404,
	[VoiceErrorCode.NOT_IN_VOICE]: 409,
	[VoiceErrorCode.NOT_CONNECTED]: 404,
	[VoiceErrorCode.SOUND_NOT_FOUND]: 404,
	[VoiceErrorCode.TRANSACTION_NOT_FOUND]: 404,
	[VoiceErrorCode.MISSING_PERMISSIONS]: 403,
	[VoiceErrorCode.IMPORT_FAILED]: 422,
	[VoiceErrorCode.SOUNDBOARD_FULL]: 409,
	[VoiceErrorCode.INVALID_INPUT]: 400,
	[VoiceErrorCode.HOUSE_RULE]: 403,
	[VoiceErrorCode.INTERNAL]: 500,
};

const DEFAULT_POLL_MS = 25_000;
const MAX_POLL_MS = 120_000;

const fail = (error: VoiceError, status = statusFor[error.code]) => Response.json(error, { status });
const invalid = (message: string) => new VoiceFailure(VoiceErrorCode.INVALID_INPUT, message);

const enqueueSources: readonly EnqueueRequest['source'][] = ['command', 'panel', 'button', 'quiz'];

function source(value: unknown): EnqueueRequest['source'] {
	const found = enqueueSources.find(s => s === value);
	if (!found) throw invalid(`source must be one of ${enqueueSources.join(', ')}`);
	return found;
}

const isSnowflake = (v: unknown): v is string => typeof v === 'string' && /^\d{17,20}$/.test(v);
const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function snowflake(value: unknown, name: string): string {
	if (!isSnowflake(value)) throw invalid(`${name} must be a snowflake`);
	return value;
}

function soundId(value: unknown): number {
	const id = typeof value === 'string' && /^\d{1,10}$/.test(value) ? Number(value) : value;
	if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
		throw invalid('sound id must be a positive integer');
	return id;
}

async function body(req: Request): Promise<Record<string, unknown>> {
	const data: unknown = await req.json().catch(() => null);
	if (typeof data !== 'object' || data === null) throw invalid('body must be a JSON object');
	return data as Record<string, unknown>;
}

// both sides are hashed so the comparison takes the same time whatever the key lengths are
const digest = (value: string) => createHash('sha256').update(value).digest();

type Handler = (req: Bun.BunRequest) => Response | Promise<Response>;

export function createServer(deps: AppDeps, port: number) {
	const { client, voice, soundsDir } = deps;
	const expectedKey = digest(deps.accessKey);

	/** requires the access key and turns thrown errors into contract error bodies */
	const guard =
		(handler: Handler): Handler =>
		async req => {
			if (!timingSafeEqual(digest(req.headers.get('authorization') ?? ''), expectedKey)) {
				return fail({ code: VoiceErrorCode.INVALID_INPUT, message: 'missing or wrong authorization header' }, 401);
			}
			try {
				return await handler(req);
			} catch (err) {
				if (err instanceof VoiceFailure) {
					return fail({ code: err.code, message: err.message, ...(err.rule && { rule: err.rule }) });
				}
				log.error(`${req.method} ${new URL(req.url).pathname} failed`, err);
				return fail({ code: VoiceErrorCode.INTERNAL, message: 'internal error' });
			}
		};

	const guildOf = (id: string) => {
		const guild = client.guilds.cache.get(id);
		if (!guild) throw new VoiceFailure(VoiceErrorCode.GUILD_NOT_FOUND, 'the bot is not in this guild');
		return guild;
	};

	const storedFile = async (rawId: string) => {
		const file = Bun.file(soundPath(soundsDir, soundId(rawId)));
		if (!(await file.exists())) throw new VoiceFailure(VoiceErrorCode.SOUND_NOT_FOUND, 'sound not found');
		return file;
	};

	return Bun.serve({
		port,
		// long polls last up to MAX_POLL_MS and imports can take a while
		idleTimeout: 255,
		routes: {
			'/health': () => new Response(null, { status: client.isReady() && deps.isDatabaseReady() ? 200 : 503 }),

			'/guilds/:guild/queue': {
				POST: guard(async req => {
					const data = await body(req);
					const res = await voice.enqueue(
						snowflake(req.params.guild, 'guild'),
						snowflake(data.userId, 'userId'),
						soundId(data.soundId),
						source(data.source),
					);
					return Response.json(res, { status: 201 });
				}),
				DELETE: guard(req => {
					voice.queue.clear(snowflake(req.params.guild, 'guild'));
					return new Response(null, { status: 204 });
				}),
			},

			'/guilds/:guild/skip': {
				POST: guard(req =>
					Response.json({ skipped: voice.queue.skip(snowflake(req.params.guild, 'guild')) } satisfies SkipResponse),
				),
			},

			'/guilds/:guild/leave': {
				POST: guard(req => {
					if (!voice.leave(snowflake(req.params.guild, 'guild'))) {
						throw new VoiceFailure(VoiceErrorCode.NOT_CONNECTED, 'the bot is not connected in this guild');
					}
					return new Response(null, { status: 204 });
				}),
			},

			'/guilds/:guild/members/:user': {
				GET: guard(async req => {
					const guild = guildOf(snowflake(req.params.guild, 'guild'));
					const member = await guild.members.fetch(snowflake(req.params.user, 'user')).catch(() => null);
					if (!member) throw new VoiceFailure(VoiceErrorCode.MEMBER_NOT_FOUND, 'member not found');
					return Response.json({
						voiceChannelId: member.voice.channelId,
						botVoiceChannelId: guild.members.me?.voice.channelId ?? null,
					} satisfies MemberResponse);
				}),
			},

			'/users/:user': {
				GET: guard(async req => {
					const user = await client.users.fetch(snowflake(req.params.user, 'user')).catch(() => null);
					if (!user) throw new VoiceFailure(VoiceErrorCode.MEMBER_NOT_FOUND, 'user not found');
					return Response.json({ username: user.username, displayName: user.displayName } satisfies UserResponse);
				}),
			},

			'/transactions/:id': {
				GET: guard(async req => {
					const params = new URL(req.url).searchParams;
					const until = params.get('until') ?? 'done';
					if (until !== 'playing' && until !== 'done') throw invalid('until must be playing or done');
					const timeoutMs = Number(params.get('timeoutMs') ?? DEFAULT_POLL_MS);
					if (!isMs(timeoutMs)) throw invalid('timeoutMs must be a non-negative integer');
					const tx = await voice.queue.wait(req.params.id, until, Math.min(timeoutMs, MAX_POLL_MS));
					if (!tx) throw new VoiceFailure(VoiceErrorCode.TRANSACTION_NOT_FOUND, 'transaction not found');
					return Response.json(tx);
				}),
			},

			'/sounds/:id': {
				PUT: guard(async req => {
					const id = soundId(req.params.id);
					const data = await body(req);
					const { url, startMs, endMs } = data;
					if (typeof url !== 'string' || !isAllowedUrl(url)) throw invalid('url must be a Discord attachment URL');
					if (startMs !== undefined && !isMs(startMs)) throw invalid('startMs must be a non-negative integer');
					if (endMs !== undefined && (!isMs(endMs) || endMs <= (startMs ?? 0))) {
						throw invalid('endMs must be an integer after startMs');
					}
					return Response.json(await importSound(soundsDir, id, { url, startMs, endMs }));
				}),
				DELETE: guard(async req => {
					await rm(soundPath(soundsDir, soundId(req.params.id)), { force: true });
					return new Response(null, { status: 204 });
				}),
			},

			'/sounds/:id/file': {
				GET: guard(async req => {
					const file = await storedFile(req.params.id);
					return new Response(file, { headers: { 'content-type': 'audio/ogg' } });
				}),
			},

			'/sounds/:id/meta': {
				GET: guard(async req => {
					const file = await storedFile(req.params.id);
					return Response.json({
						durationMs: await probeDurationMs(file.name!),
						size: file.size,
					} satisfies SoundMetaResponse);
				}),
			},

			'/guilds/:guild/soundboard': {
				POST: guard(async req => {
					const guild = guildOf(snowflake(req.params.guild, 'guild'));
					const data = await body(req);
					const { name, emoji, startMs = 0 } = data;
					const userId = snowflake(data.userId, 'userId');
					if (typeof name !== 'string' || name.length < 2 || name.length > nativeSoundboardLimits.maxNameLength) {
						throw invalid(`name must be 2 to ${nativeSoundboardLimits.maxNameLength} characters`);
					}
					if (emoji !== undefined && (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 32)) {
						throw invalid('the emoji has to be a standard Unicode emoji, not a custom one');
					}
					if (!isMs(startMs)) throw invalid('startMs must be a non-negative integer');
					const file = await storedFile(String(data.soundId));

					const mp3 = await encodeMp3Clip(file.name!, {
						startMs,
						durationMs: nativeSoundboardLimits.maxDurationMs,
						maxBytes: nativeSoundboardLimits.maxBytes,
					}).catch((err: Error) => {
						throw err instanceof RangeError ? invalid(err.message) : err;
					});
					const user = await client.users.fetch(userId).catch(() => null);
					try {
						const sound = await guild.soundboardSounds.create({
							file: Buffer.from(mp3),
							contentType: 'audio/mpeg',
							name,
							emojiName: emoji,
							reason: `exported by ${user?.username ?? 'unknown user'} (${userId})`,
						});
						return Response.json({ soundboardSoundId: sound.soundId } satisfies SoundboardExportResponse, {
							status: 201,
						});
					} catch (err) {
						if (err instanceof DiscordAPIError) {
							if (err.code === RESTJSONErrorCodes.MissingPermissions) {
								throw new VoiceFailure(
									VoiceErrorCode.MISSING_PERMISSIONS,
									missingPermissionsMessage(['Create Expressions'], 'on this server'),
								);
							}
							if (err.code === RESTJSONErrorCodes.MaximumNumberOfSoundboardSoundsReached) {
								throw new VoiceFailure(VoiceErrorCode.SOUNDBOARD_FULL, 'the soundboard has no free slots');
							}
							if (err.status === 400) throw invalid(err.message);
						}
						throw err;
					}
				}),
			},
		},
		fetch: () => fail({ code: VoiceErrorCode.INVALID_INPUT, message: 'not found' }, 404),
	});
}
