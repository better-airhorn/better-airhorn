import { OnInit, Service } from '@better-airhorn/shori';
import { constants, createReadStream, createWriteStream, promises } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { Config } from '../config/Config';
import { isProd } from '../utils/isEnvironment';
import { onceEmitted } from '../utils/Utils';

/**
 * This Service provides methods to access the local file cache
 *
 * @class FileCachingService
 */
@Service()
export class FileCachingService implements OnInit {
	public async shOnInit() {
		if (isProd()) {
			await promises.rmdir(Config.files.cacheDirectory, { recursive: true });
		}
		await promises.mkdir(Config.files.cacheDirectory, { recursive: true });
	}

	public getFullPath(otherPart: string): string {
		return join(Config.files.cacheDirectory, otherPart);
	}

	public async get(id: string): Promise<Readable> {
		const fullPath = this.getFullPath(id.toString());
		await promises.access(fullPath);
		return createReadStream(fullPath);
	}

	public set(id: string, stream: Readable): Promise<void> {
		return onceEmitted(stream.pipe(createWriteStream(this.getFullPath(id.toString()))), 'close');
	}

	public async delete(id: string): Promise<void> {
		const fullPath = this.getFullPath(id.toString());
		if (
			await promises
				.access(fullPath, constants.F_OK)
				.then(() => true)
				.catch(() => false)
		) {
			return promises.unlink(fullPath);
		}
	}
}
