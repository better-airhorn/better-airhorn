import fileSize from 'filesize-parser';

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
			secret: process.env.VOICENODE_ACCESS_KEY!,
		},
	},
	logging: {
		level: 'debug',
	},
	admins: ['196214245770133504', '329651188641431574'],

	limitations: {
		maxSingleFileSize: fileSize('10MB'),
		maxTotalFileSizes: fileSize('300MB'),

		// require votes from those limits
		voting: {
			files: {
				// if user has X files or XMB of files, they need to vote
				// then they can upload "unmetered" (global limits apply) for X days
				fileSizes: fileSize('50MB'),
				fileAmounts: 15,
				hoursToUnlock: 49,
			},
			plays: {
				// if user has X * the last two days average they need to vote.
				// then they can play "unmetered" for a X days
				averageMultiplicator: 2,
				hoursToUnlock: 25,
				// if average is lower than X, take X as average
				minimumAverage: 5,
			},
		},
	},
};
