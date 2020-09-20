import { Service } from '@better-airhorn/shori';
import AwaitLock from 'await-lock';

@Service()
export class ChannelLockService {
	private readonly lockMap = new Map<string, AwaitLock>();

	public getLock(resource: string): AwaitLock {
		if (!this.lockMap.has(resource)) {
			const lock = new AwaitLock();
			this.lockMap.set(resource, lock);
			return lock;
		}
		return this.lockMap.get(resource);
	}

	public release(resource: string) {
		this.lockMap.get(resource)?.release();
	}

	public get getMap(): Map<string, AwaitLock> {
		return this.lockMap;
	}
}
