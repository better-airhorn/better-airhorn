import Redis from 'ioredis';
export const createClient = (redisPort: number, redisUrl: string, redisAuth?: string) => {
	const client = new Redis(redisPort, redisUrl, { password: redisAuth });
	return client;
};
