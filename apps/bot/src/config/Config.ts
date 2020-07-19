import { BitFieldResolvable, IntentsString } from 'discord.js';
import fileSize from 'filesize-parser';
import { normalize } from 'path';

export const Config = {
	client: {
		intents: [
			'GUILDS',
			'GUILD_VOICE_STATES',
			'GUILD_MESSAGES',
			'GUILD_MESSAGE_REACTIONS',
			'DIRECT_MESSAGES',
		] as BitFieldResolvable<IntentsString>,
	},

	queue: {
		playQueue: {
			name: 'play',
			simulationsProcessors: 25,
			lockKeyGenerator: (channelId: string, guildId: string): string => `ba-guild-lock-${guildId}`,
		},
		channelRequestQueue: {
			name: 'channel-request',
		},
	},

	files: {
		maxFileSize: fileSize('50MB'),
		minIOBucketName: 'better-airhorn-audio-files',
		cacheDirectory: normalize(`${__dirname}../../../file_cache`),
	},

	general: {
		prefix: '$',
		ownerIds: ['196214245770133504', '329651188641431574'],
	},

	colors: {
		neutral: '226764',
	},

	emojis: {
		import: '737771544280825976',
		loading: '<a:BE_loading:505378765950550036>',
		postgres: '<:postgres:707623202993602700>',
		minIO: '<:minIO:713895494555926528>',
	},

	credentials: {
		postgres: {
			url: process.env.PG,
		},

		redis: {
			url: process.env.REDIS,
		},

		discord: {
			token: process.env.DISCORD_TOKEN,
		},

		minio: {
			accessKey: process.env.MINIO_AK,
			secretKey: process.env.MINIO_SK,
			url: process.env.MINIO_URL?.split(':')[0],
			port: parseInt(process.env.MINIO_URL?.split(':')[1] ?? '8500', 10),
		},
		loki: {
			url: process.env.LOKI_URL,
		},
		statping: {
			url: process.env.STATPING_URL,
		},
	},

	caching: {
		GuildSettingsCacheDuration: 10 * 1000,
	},

	audio: {
		maxRecordTime: 20 * 1000,
	},

	logging: {
		level: (process.env.LOGGING ?? 'debug') as 'debug' | 'info' | 'error',
	},
};
