import { BaseGuard, Message, resolveSingleton } from '@better-airhorn/shori';
import ms from 'ms';
import { getConnection } from 'typeorm';
import { MinIOService } from '../services/MinIOService';
import { getSubLogger } from '../utils/Logger';
import { isTimeOver } from '../utils/Utils';

const updateInterval = ms('10s');
export class HealthCheckGuard extends BaseGuard {
	private readonly minIO: MinIOService;
	private readonly log = getSubLogger(HealthCheckGuard.name);
	private healthStatuses = { pg: false, minIO: false, lastUpdated: 0 };

	public constructor() {
		super();
		// workaround until shori can inject for Guards
		this.minIO = resolveSingleton(MinIOService);
	}

	public async canActivate(message: Message): Promise<boolean> {
		if (isTimeOver(this.healthStatuses.lastUpdated, updateInterval)) {
			this.log.debug('updating health statuses');
			await this.updateHealthStatus();
		}
		if (!this.healthStatuses.minIO) {
			this.log.warn('connection to minIO lost');
			await message.error('The connection to minIO is not available, please try again later').catch(() => null);
			return false;
		}
		if (!this.healthStatuses.pg) {
			this.log.warn('connection to PostgreSQL lost');
			await message.error('The connection to PostgreSQL is not available, please try again later').catch(() => null);
			return false;
		}
		return true;
	}

	private async updateHealthStatus(): Promise<void> {
		this.healthStatuses = {
			lastUpdated: Date.now(),
			minIO: await this.minIO.healthy(),
			pg: getConnection().isConnected,
		};
	}
}
