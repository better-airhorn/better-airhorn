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
		// ensure the file is there
		await this.stat('hotword-detected');
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
		await this.client.bucketExists(this.bucketName).then(exists => {
			if (!exists) throw Error(`MinIO Bucket not available`);
		});
		return Date.now() - start;
	}

	public async healthy(): Promise<boolean> {
		const value = await this.pseudoPing()
			.then(() => true)
			.catch(() => false);
		return value;
	}
}
