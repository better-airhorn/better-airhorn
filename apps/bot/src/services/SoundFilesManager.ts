import { Service } from '@better-airhorn/shori';
import { BucketItemStat, UploadedObjectInfo } from 'minio';
import { Readable } from 'stream';
import { FileCachingService } from './FileCachingService';
import { MinIOService } from './MinIOService';

/**
 * This Service provides the higher abstractions, it handles caching and directly requesting file from MinIO
 * If a file is available in the cache, it will create a stream on it, if it isnt, it will request it from MinIO
 * and create a cache of it
 *
 * @class SoundFilesManager
 */
@Service()
export class SoundFilesManager {
	public constructor(private readonly fileCache: FileCachingService, private readonly minIO: MinIOService) {}

	public async get(id: number | string): Promise<Readable> {
		try {
			return await this.fileCache.get(id.toString());
		} catch (e) {
			const stream = await this.minIO.get(id.toString());
			this.fileCache.set(id.toString(), stream).catch(() => null);
			return stream;
		}
	}

	public set(id: number, stream: Readable): Promise<UploadedObjectInfo> {
		return this.minIO.add(id.toString(), stream);
	}

	public delete(id: number): Promise<[void, void]> {
		return Promise.all([this.minIO.delete(id.toString()), this.fileCache.delete(id.toString())]);
	}

	public stat(id: number): Promise<BucketItemStat> {
		return this.minIO.stat(id.toString());
	}
}
