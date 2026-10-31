import {
	createLogger,
	terminalStates,
	VoiceErrorCode,
	type EnqueueResponse,
	type TransactionResponse,
	type TransactionState,
	type VoiceError,
} from '@better-airhorn/structures';

/** an error that carries a contract error code to the HTTP response or the failed transaction */
export class VoiceFailure extends Error {
	public constructor(
		public readonly code: VoiceErrorCode,
		message: string,
	) {
		super(message);
	}
}

export interface QueueItem {
	guildId: string;
	userId: string;
	soundId: number;
}

/**
 * Plays one item. Calls `started` once audio is actually playing, resolves when playback ends and
 * stops early when `signal` aborts.
 */
export type PlayFn = (item: QueueItem, signal: AbortSignal, started: () => void) => Promise<void>;

interface Transaction {
	id: string;
	item: QueueItem;
	state: TransactionState;
	error?: VoiceError;
	finishedAt?: number;
	listeners: Set<() => void>;
}

interface GuildQueue {
	pending: Transaction[];
	current?: { tx: Transaction; ac: AbortController };
}

const log = createLogger('queue');

/** terminal transactions stay queryable this long */
export const TRANSACTION_RETENTION_MS = 30 * 60_000;

const isTerminal = (state: TransactionState) => terminalStates.includes(state);

/** per-guild FIFO playback queue; every queued item is tracked as a transaction */
export class PlaybackQueue {
	private readonly guilds = new Map<string, GuildQueue>();
	private readonly transactions = new Map<string, Transaction>();

	public constructor(
		private readonly play: PlayFn,
		/** called when a guild's queue has run empty */
		private readonly onIdle: (guildId: string) => void = () => {},
	) {}

	public enqueue(item: QueueItem): EnqueueResponse {
		const tx: Transaction = { id: crypto.randomUUID(), item, state: 'queued', listeners: new Set() };
		this.transactions.set(tx.id, tx);
		let queue = this.guilds.get(item.guildId);
		if (!queue) this.guilds.set(item.guildId, (queue = { pending: [] }));
		const position = queue.pending.length + (queue.current ? 1 : 0);
		queue.pending.push(tx);
		this.next(item.guildId);
		return { transactionId: tx.id, position };
	}

	/** whether the guild has something playing or queued */
	public isBusy(guildId: string): boolean {
		return this.guilds.has(guildId);
	}

	public get(id: string): TransactionResponse | undefined {
		const tx = this.transactions.get(id);
		return tx && { transactionId: tx.id, state: tx.state, ...(tx.error && { error: tx.error }) };
	}

	/**
	 * Resolves once the transaction reached `until` (`playing` is also satisfied by any terminal state)
	 * or after `timeoutMs` with whatever its state is then; undefined when it does not exist.
	 */
	public async wait(
		id: string,
		until: 'playing' | 'done',
		timeoutMs: number,
	): Promise<TransactionResponse | undefined> {
		const tx = this.transactions.get(id);
		if (!tx) return undefined;
		const reached = () => (until === 'done' ? isTerminal(tx.state) : tx.state !== 'queued');
		if (!reached()) {
			await new Promise<void>(resolve => {
				const done = () => {
					clearTimeout(timer);
					tx.listeners.delete(check);
					resolve();
				};
				const check = () => {
					if (reached()) done();
				};
				const timer = setTimeout(done, timeoutMs);
				tx.listeners.add(check);
			});
		}
		return this.get(id);
	}

	/** stops the current sound; false when nothing is playing */
	public skip(guildId: string): boolean {
		const current = this.guilds.get(guildId)?.current;
		current?.ac.abort();
		return current !== undefined;
	}

	/** drops everything queued and stops the current sound */
	public clear(guildId: string): void {
		const queue = this.guilds.get(guildId);
		if (!queue) return;
		for (const tx of queue.pending.splice(0)) this.settle(tx, 'skipped');
		queue.current?.ac.abort();
	}

	/** forgets terminal transactions older than {@link TRANSACTION_RETENTION_MS} */
	public sweep(now = Date.now()): void {
		for (const [id, tx] of this.transactions) {
			if (tx.finishedAt !== undefined && now - tx.finishedAt >= TRANSACTION_RETENTION_MS) this.transactions.delete(id);
		}
	}

	private next(guildId: string): void {
		const queue = this.guilds.get(guildId);
		if (!queue || queue.current) return;
		const tx = queue.pending.shift();
		if (!tx) {
			this.guilds.delete(guildId);
			this.onIdle(guildId);
			return;
		}
		const ac = new AbortController();
		queue.current = { tx, ac };
		// once aborted, the outcome is the skip itself, whether play resolved or rejected
		const end = (state: TransactionState, error?: VoiceError) => {
			this.settle(tx, ac.signal.aborted ? 'skipped' : state, error);
			queue.current = undefined;
			this.next(guildId);
		};
		Promise.resolve()
			.then(() => this.play(tx.item, ac.signal, () => this.transition(tx, 'playing')))
			.then(
				() => end('finished'),
				(err: unknown) =>
					end(
						'failed',
						err instanceof VoiceFailure
							? { code: err.code, message: err.message }
							: { code: VoiceErrorCode.INTERNAL, message: err instanceof Error ? err.message : String(err) },
					),
			);
	}

	private settle(tx: Transaction, state: TransactionState, error?: VoiceError): void {
		if (isTerminal(tx.state)) return;
		if (state === 'failed') tx.error = error;
		tx.finishedAt = Date.now();
		this.transition(tx, state);
	}

	private transition(tx: Transaction, state: TransactionState): void {
		if (isTerminal(tx.state)) return;
		tx.state = state;
		if (isTerminal(state)) {
			const { guildId, userId, soundId } = tx.item;
			const line = `sound ${soundId} ${state} in guild ${guildId} for user ${userId}`;
			if (state === 'failed') log.warn(line, tx.error);
			else log.info(line);
		}
		for (const listener of tx.listeners) listener();
	}
}
