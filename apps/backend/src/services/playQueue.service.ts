import { IPlayJobRequestData, IVoiceChannelsJobRequest } from '@better-airhorn/structures';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job, JobId, Queue } from 'bull';
import { Config } from '../Config';

type callbackFunction = (progress: number, shouldClose: boolean, err: boolean) => any;

@Injectable()
export class PlayQueueService implements OnModuleInit {
	private readonly progressMap = new Map<JobId, callbackFunction[]>();

	public constructor(
		@InjectQueue(Config.queue.playQueue.name) private readonly queue: Queue<IVoiceChannelsJobRequest>,
	) {}

	public onModuleInit() {
		this.queue.on('global:progress', (id: string, progress: number) => {
			const callbacks = this.progressMap.get(id);
			if (!callbacks) return;
			callbacks.forEach(callback => callback(progress, false, false));
		});
		this.queue.on('global:completed', id => this.off(id));
		this.queue.on('global:failed', id => this.off(id, undefined, true));
	}

	public async add(data: IPlayJobRequestData): Promise<Job<IVoiceChannelsJobRequest>> {
		// TODO: calculate correct shard, for now, 0 will do as long as internal sharding works
		const shard = '0';
		return this.queue.add(shard, data);
	}

	public async progress(idOrJob: string | Job, callback: callbackFunction): Promise<() => void> {
		const job = typeof idOrJob === 'string' ? await this.queue.getJob(idOrJob) : idOrJob;
		if (!job) {
			throw new Error(`job with id '${idOrJob}' was not found`);
		}
		if (await job.isCompleted()) {
			callback(100, true, false);
			return () => undefined;
		}
		if (await job.isFailed()) {
			callback(100, true, true);
			return () => undefined;
		}
		if (this.progressMap.has(job.id)) this.progressMap.get(job.id).push(callback);
		else this.progressMap.set(job.id, [callback]);

		return this.off.bind(this, job.id, callback);
	}

	public off(id: JobId, callback?: callbackFunction, failed = false): void {
		if (!callback) {
			this.progressMap.get(id)?.forEach(c => c(0, true, failed));
			this.progressMap.delete(id);
			return;
		}
		if (this.progressMap.has(id)) {
			this.progressMap.set(
				id,
				this.progressMap.get(id).filter(x => x !== callback),
			);
		}
	}
}
