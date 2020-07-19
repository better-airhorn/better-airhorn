import { Service } from '@better-airhorn/shori';
import AwaitLock from 'await-lock';
import { JobId, JobPromise, Queue } from 'bull';
import { SoundCommandService } from '../services/SoundCommandService';

interface JobEntry {
	id: JobId;
	callback: (jobPromise: JobPromise) => void;
	event: string;
}

@Service()
export class QueueUtils {
	private readonly queue: Queue;
	private jobList: JobEntry[] = [];
	private readonly lock = new AwaitLock();
	public constructor(soundCommandService: SoundCommandService) {
		this.queue = soundCommandService.queue;
		this.queue.on('global:active', async (jobId: JobId, jobPromise: JobPromise) => {
			await this.lock.acquireAsync();
			try {
				const callbacks = this.jobList.filter(d => d.id === jobId && d.event === 'active');
				callbacks.forEach(d => d.callback(jobPromise));
				this.jobList = this.jobList.filter(d => !callbacks.includes(d));
			} finally {
				this.lock.release();
			}
		});
	}

	public async onActive(id: JobId): Promise<JobPromise> {
		return new Promise(async res => {
			await this.lock.acquireAsync();
			try {
				this.jobList.push({ id, callback: res, event: 'active' });
			} finally {
				this.lock.release();
			}
		});
	}
}
