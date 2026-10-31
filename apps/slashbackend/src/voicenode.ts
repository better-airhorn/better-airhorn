import {
	VoiceErrorCode,
	type EnqueueRequest,
	type EnqueueResponse,
	type ImportRequest,
	type ImportResponse,
	type MemberResponse,
	type SkipResponse,
	type SoundboardExportRequest,
	type SoundboardExportResponse,
	type TransactionResponse,
	type UserResponse,
	type VoiceError,
} from '@better-airhorn/structures';

export class VoiceNodeError extends Error {
	public constructor(
		public readonly code: VoiceErrorCode,
		message: string,
		public readonly status: number,
	) {
		super(message);
	}
}

/** what users see for each voicenode error */
export const voiceErrorMessages: Record<VoiceErrorCode, string> = {
	[VoiceErrorCode.GUILD_NOT_FOUND]: "I'm not on this server. Add me with `/invite` first.",
	[VoiceErrorCode.MEMBER_NOT_FOUND]: "I couldn't find you on this server. Try again in a moment.",
	[VoiceErrorCode.NOT_IN_VOICE]: 'Join a voice channel first, then try again.',
	[VoiceErrorCode.NOT_CONNECTED]: "I'm not in a voice channel right now.",
	[VoiceErrorCode.SOUND_NOT_FOUND]: "This sound's audio file is missing. Ask the uploader to upload it again.",
	[VoiceErrorCode.TRANSACTION_NOT_FOUND]: 'I lost track of that playback. It may have already finished.',
	[VoiceErrorCode.MISSING_PERMISSIONS]:
		"I'm missing a permission for that (View Channel, Connect, Speak or Create Expressions). Check my role and the channel's permissions.",
	[VoiceErrorCode.IMPORT_FAILED]: "I couldn't read that file as audio. Try another file or format.",
	[VoiceErrorCode.SOUNDBOARD_FULL]:
		"This server's soundboard is full. Remove a sound or boost the server for more slots.",
	[VoiceErrorCode.INVALID_INPUT]: "I couldn't use those options:",
	[VoiceErrorCode.INTERNAL]: 'Something went wrong on my side. Please try again in a moment.',
};

export function voiceErrorMessage(err: VoiceNodeError): string {
	const base = voiceErrorMessages[err.code] ?? voiceErrorMessages[VoiceErrorCode.INTERNAL];
	return err.code === VoiceErrorCode.INVALID_INPUT ? `${base} ${err.message}` : base;
}

export type VoiceNode = ReturnType<typeof createVoiceNode>;

export function createVoiceNode(baseUrl: string, accessKey: string) {
	/** `timeoutMs` keeps commands inside Discord's 3 s answer window when voicenode is slow or down */
	async function call(method: string, path: string, body?: unknown, timeoutMs = 5_000): Promise<Response> {
		let res: Response;
		try {
			res = await fetch(`${baseUrl}${path}`, {
				method,
				headers: { authorization: accessKey, 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (e) {
			throw new VoiceNodeError(VoiceErrorCode.INTERNAL, `voicenode unreachable: ${(e as Error).message}`, 0);
		}
		if (res.ok) return res;
		const err = (await res.json().catch(() => null)) as Partial<VoiceError> | null;
		const code = Object.values(VoiceErrorCode).includes(err?.code as VoiceErrorCode)
			? (err!.code as VoiceErrorCode)
			: VoiceErrorCode.INTERNAL;
		throw new VoiceNodeError(code, err?.message ?? `${res.status} ${res.statusText}`, res.status);
	}
	const json = async <T>(res: Promise<Response>) => (await res).json() as Promise<T>;
	const empty = async (res: Promise<Response>) => void (await res);

	return {
		health: () =>
			fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) }).then(
				r => r.ok,
				() => false,
			),
		enqueue: (guild: string, req: EnqueueRequest) => json<EnqueueResponse>(call('POST', `/guilds/${guild}/queue`, req)),
		/** long poll; `timeoutMs` is capped at 120 s by voicenode */
		transaction: (id: string, until: 'playing' | 'done', timeoutMs: number) =>
			json<TransactionResponse>(
				call(
					'GET',
					`/transactions/${id}?until=${until}&timeoutMs=${Math.min(120_000, Math.max(0, timeoutMs))}`,
					undefined,
					Math.min(120_000, Math.max(0, timeoutMs)) + 10_000,
				),
			),
		skip: (guild: string) => json<SkipResponse>(call('POST', `/guilds/${guild}/skip`)),
		clear: (guild: string) => empty(call('DELETE', `/guilds/${guild}/queue`)),
		leave: (guild: string) => empty(call('POST', `/guilds/${guild}/leave`)),
		member: (guild: string, user: string) => json<MemberResponse>(call('GET', `/guilds/${guild}/members/${user}`)),
		/** short: only used for display names, which fall back to a mention */
		user: (user: string) => json<UserResponse>(call('GET', `/users/${user}`, undefined, 1_500)),
		/** download, conversion and normalisation of up to 50 MB run inside this request */
		importSound: (id: number, req: ImportRequest) =>
			json<ImportResponse>(call('PUT', `/sounds/${id}`, req, 5 * 60_000)),
		deleteSound: (id: number) => empty(call('DELETE', `/sounds/${id}`)),
		soundFile: async (id: number) => (await call('GET', `/sounds/${id}/file`, undefined, 30_000)).arrayBuffer(),
		exportToSoundboard: (guild: string, req: SoundboardExportRequest) =>
			json<SoundboardExportResponse>(call('POST', `/guilds/${guild}/soundboard`, req, 60_000)),
	};
}
