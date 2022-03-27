export const Config = {
	port: process.env.PORT!,
	credentials: {
		postgres: `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@postgres:5432/postgres`,
		redis: `redis://:${process.env.REDIS_PASSWORD}@redis:6379`,
		secrets: {
			topgg: process.env.SECRETS_TOPGG!,
		},
		discord: {
			appId: process.env.DISCORD_APP_ID!,
			publicKey: process.env.DISCORD_PUBLIC_KEY!,
			token: process.env.DISCORD_TOKEN!,
		},
		meili: {
			url: 'http://meili:7700',
			apiKey: process.env.MEILI_MASTER_KEY!,
		},
		voicenode: {
			url: 'http://voicenode:8888',
			secret: 'verysicher',
		},
	},
	logging: {
		level: 'debug',
	},
	admins: ['196214245770133504', '329651188641431574'],
};
