/**
 * HTTP contract between slashbackend (client) and voicenode (server).
 *
 * Every route except `GET /health` requires the header `authorization: <VOICENODE_ACCESS_KEY>`.
 * Successful responses are JSON (or 204 / an audio stream where noted); failures are a
 * non-2xx status with a {@link VoiceError} body.
 */

export enum VoiceErrorCode {
	/** the bot is not a member of the guild */
	GUILD_NOT_FOUND = 'GUILD_NOT_FOUND',
	MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
	/** the requesting member is not in a voice channel of that guild */
	NOT_IN_VOICE = 'NOT_IN_VOICE',
	/** the bot is not connected to voice in that guild */
	NOT_CONNECTED = 'NOT_CONNECTED',
	SOUND_NOT_FOUND = 'SOUND_NOT_FOUND',
	TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
	/** the bot lacks a Discord permission (connect, speak, create expressions, ...) */
	MISSING_PERMISSIONS = 'MISSING_PERMISSIONS',
	/** downloading or converting an uploaded file failed, or the file is not audio */
	IMPORT_FAILED = 'IMPORT_FAILED',
	/** the guild's native soundboard has no free slots */
	SOUNDBOARD_FULL = 'SOUNDBOARD_FULL',
	INVALID_INPUT = 'INVALID_INPUT',
	INTERNAL = 'INTERNAL',
}

export interface VoiceError {
	code: VoiceErrorCode;
	message: string;
}

// ---- playback -------------------------------------------------------------

/**
 * Lifecycle of one queued playback. `finished`, `skipped` and `failed` are terminal.
 * voicenode keeps a transaction for at least 30 minutes after it reaches a terminal state.
 */
export type TransactionState = 'queued' | 'playing' | 'finished' | 'skipped' | 'failed';

export const terminalStates: readonly TransactionState[] = ['finished', 'skipped', 'failed'];

/**
 * `POST /guilds/:guild/queue`
 * Queues a sound in the voice channel the user is currently in. The bot joins (or moves to)
 * that channel when the sound starts.
 */
export interface EnqueueRequest {
	userId: string;
	soundId: number;
}

/** 201 */
export interface EnqueueResponse {
	transactionId: string;
	/** 0 when it starts playing right away, otherwise the number of sounds ahead of it */
	position: number;
}

/**
 * `GET /transactions/:id?until=playing|done&timeoutMs=<n>`
 * Long poll. Answers as soon as the transaction has reached `until` (`playing` is also
 * satisfied by any terminal state; `done` means any terminal state), or after `timeoutMs`
 * (default 25000, max 120000) with whatever the state is then.
 */
export interface TransactionResponse {
	transactionId: string;
	state: TransactionState;
	/** set when state is `failed` */
	error?: VoiceError;
}

/** `POST /guilds/:guild/skip` -> 200 */
export interface SkipResponse {
	skipped: boolean;
}

/** `DELETE /guilds/:guild/queue` -> 204. Empties the queue and stops the current sound. */

/** `POST /guilds/:guild/leave` -> 204, or 404 NOT_CONNECTED */

/** `GET /guilds/:guild/members/:user` -> 200, or 404 GUILD_NOT_FOUND / MEMBER_NOT_FOUND */
export interface MemberResponse {
	/** voice channel the member is in inside this guild, null when not in voice */
	voiceChannelId: string | null;
	/** voice channel the bot is in inside this guild, null when not connected */
	botVoiceChannelId: string | null;
}

/** `GET /users/:user` -> 200, or 404 MEMBER_NOT_FOUND */
export interface UserResponse {
	username: string;
	displayName: string;
}

// ---- sound files ------------------------------------------------------------

/**
 * `PUT /sounds/:id`
 * Downloads `url`, converts it to loudness-normalised Ogg/Opus and stores it as sound `:id`,
 * replacing an existing file. Synchronous: answers when the file is stored.
 */
export interface ImportRequest {
	/** Discord attachment URL */
	url: string;
	/** optional trim, applied before normalisation */
	startMs?: number;
	endMs?: number;
}

/** 200, or 422 IMPORT_FAILED */
export interface ImportResponse {
	durationMs: number;
	/** stored size in bytes */
	size: number;
}

/** `DELETE /sounds/:id` -> 204 (also when the file did not exist) */

/** `GET /sounds/:id/file` -> 200 `audio/ogg` stream, or 404 SOUND_NOT_FOUND */

/** `GET /sounds/:id/meta` -> 200, or 404 SOUND_NOT_FOUND */
export interface SoundMetaResponse {
	durationMs: number;
	size: number;
}

// ---- native Discord soundboard -----------------------------------------------

/** Discord's limits for guild soundboard sounds */
export const nativeSoundboardLimits = {
	maxDurationMs: 5_200,
	maxBytes: 512 * 1024,
	maxNameLength: 32,
} as const;

/**
 * `POST /guilds/:guild/soundboard`
 * Cuts `[startMs, startMs + maxDurationMs)` out of the sound, encodes it within Discord's
 * limits and creates it as a sound in the guild's built-in soundboard.
 */
export interface SoundboardExportRequest {
	soundId: number;
	name: string;
	startMs?: number;
	/** unicode emoji shown next to the sound */
	emoji?: string;
	/** user shown in the guild audit log */
	userId: string;
}

/** 201, or 403 MISSING_PERMISSIONS / 409 SOUNDBOARD_FULL */
export interface SoundboardExportResponse {
	soundboardSoundId: string;
}
export * from './log';
