import { QueueEvent, QueueEventType, QueueObject } from '@better-airhorn/structures';
import AwaitLock from 'await-lock';
import { randomBytes } from 'crypto';
import { ReplaySubject } from 'rxjs';
import { getSubLogger } from '../util/Logger';

export interface QueueCallback {
	(obj: QueueObject, queueLength: number, ac: AbortController): Promise<void>;
}

export class QueueService {
	private readonly queues = new Map<string, { list: QueueObject[]; lock: AwaitLock; ac?: AbortController }>();
	private readonly log = getSubLogger(QueueService.name);
	public constructor(private readonly callback: QueueCallback) {}

	// buffer a max of 100 values
	private readonly queueEvents = new ReplaySubject<QueueEvent>(100);
	public readonly events = this.queueEvents.asObservable();
	private eventId = 0;

	public get eventID(): number {
		return this.eventId;
	}

	public getNextId() {
		return this.eventId++;
	}

	private getQueue(guildId: string) {
		if (!this.queues.has(guildId)) {
			this.queues.set(guildId, { list: [], lock: new AwaitLock() });
		}
		return this.queues.get(guildId)!;
	}

	public add(obj: QueueObject) {
		const { list } = this.getQueue(obj.guildId);
		obj.transactionId = randomBytes(8).toString('hex');
		list.push(obj);
		this.doRun(obj.guildId);
		this.queueEvents.next({
			id: this.getNextId(),
			type: QueueEventType.ADD,
			guildId: obj.guildId,
			transactionId: obj.transactionId,
		});
		return obj;
	}

	public skip(guildId: string): boolean {
		const queue = this.getQueue(guildId);
		const { lock } = queue;
		// cant skip, nothing is playing
		if (!lock.acquired) return false;
		queue.ac?.abort();
		this.queueEvents.next({ id: this.getNextId(), type: QueueEventType.SKIP, guildId });
		return true;
		// dont release the lock, doRun will do that
	}

	public clear(guildId: string, abort = false) {
		const queue = this.getQueue(guildId);
		queue.list = [];
		this.queueEvents.next({ id: this.getNextId(), type: QueueEventType.CLEAR, guildId });
		if (abort) {
			if (!queue.lock.acquired) return;
			queue.ac?.abort();
		}
	}

	private doRun(guildId: string) {
		const queue = this.getQueue(guildId);
		const { list, lock } = queue;
		if (lock.acquired || list.length === 0) return;
		const locked = lock.tryAcquire();
		// lock was already acquired
		if (!locked) return;
		const obj = list.shift()!;
		const ac = new AbortController();
		queue.ac = ac;
		this.queueEvents.next({
			id: this.getNextId(),
			type: QueueEventType.STARTING_SOUND,
			guildId,
			transactionId: obj.transactionId,
		});
		const res = this.callback(obj, list.length, ac);
		res
			.catch(e => this.log.error(`runner errored`, e))
			.finally(() => {
				this.log.debug('runner finished, releasing lock');
				lock.release();
				this.queueEvents.next({
					id: this.getNextId(),
					type: QueueEventType.FINISHED_SOUND,
					guildId,
					transactionId: obj.transactionId,
				});
				this.doRun(guildId);
			});
	}

	public length(guildId: string) {
		const { list } = this.getQueue(guildId);
		return list.length;
	}
}
