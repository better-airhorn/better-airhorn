import { OnInit, Service } from '@better-airhorn/shori';
import { BucketItemStat, Client } from 'minio';
import { Readable } from 'stream';
import { Config } from '../config/Config';
import { isProd } from '../utils/isEnvironment';

/**
 * This Service provides basic actions against the MinIO Server
 *
 * @class MinIOService
 */
@Service()
export class MinIOService implements OnInit {
	private readonly client: Client;
	private readonly bucketName: string;
	public constructor() {
		this.client = new Client({
			endPoint: Config.credentials.minio.url,
			port: Config.credentials.minio.port,
			useSSL: isProd(),
			accessKey: Config.credentials.minio.accessKey,
			secretKey: Config.credentials.minio.secretKey,
		});
		this.bucketName = Config.files.minIOBucketName;
	}

	public async shOnInit() {
		await this.client.bucketExists(this.bucketName).then(exists => {
			if (!exists) {
				return this.client.makeBucket(this.bucketName, 'us-east-1');
			}
		});
	}

	public add(name: string, stream: Readable): Promise<string> {
		return this.client.putObject(this.bucketName, name, stream);
	}

	public get(name: string): Promise<Readable> {
		return this.client.getObject(this.bucketName, name);
	}

	public delete(name: string): Promise<void> {
		return this.client.removeObject(this.bucketName, name);
	}

	public stat(name: string): Promise<BucketItemStat> {
		return this.client.statObject(this.bucketName, name);
	}

	public async pseudoPing(): Promise<number> {
		const start = Date.now();
		await this.client.statObject(this.bucketName, Math.random().toString()).catch(() => null);
		return Date.now() - start;
	}
}
