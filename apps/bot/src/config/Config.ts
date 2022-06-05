import { BitFieldResolvable, IntentsString } from 'discord.js';
import fileSize from 'filesize-parser';
import { existsSync, readdirSync } from 'fs';
import { join, normalize } from 'path';

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
		},
		channelRequestQueue: {
			name: 'channel-request',
		},
	},

	files: {
		maxFileSize: fileSize('50MB'),
		// a sum of all files a user is allowed to have
		maxUserFiles: fileSize('500MB'),
		minIOBucketName: process.env.MINIO_BUCKETNAME!,
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
		minIO: '<:minIO:713895494555926528>',
	},

	credentials: {
		postgres: {
			url: `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@postgres:5432/postgres`,
		},

		redis: {
			url: `redis://:${process.env.REDIS_PASSWORD}@redis:6379`,
		},

		discord: {
			token: process.env.DISCORD_TOKEN!,
			applicationId: process.env.DISCORD_APP_ID!,
		},

		minio: {
			accessKey: process.env.MINIO_ACCESS_KEY!,
			secretKey: process.env.MINIO_SECRET_KEY!,
			url: 'minio',
			port: 9000,
		},
		loki: {
			url: process.env.LOKI_URL!,
		},
		statping: {
			url: process.env.STATPING_URL!,
		},
		meili: {
			url: 'http://meili:7700',
			apiKey: process.env.MEILI_MASTER_KEY!,
		},

		googleCloudApiKey: process.env.GOOGLE_CLOUD_APIKEY,

		botlists: {
			'top.gg': process.env.BOTLISTS_TOPGG!,
			'discordbotlist.com': process.env.BOTLISTS_DBL!,
			'discord.bots.gg': process.env.BOTLISTS_DBGG!,
			'bots.ondiscord.xyz': process.env.BOTLISTS_BOD!,
			'botsfordiscord.com': process.env.BOTLISTS_BFD!,
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

	localization: {
		defaultLanguage: 'en-US',
		files: '',
	},

	misc: {
		appmetricsPort: process.env.DASH_PORT,
		supportServerUrl: 'https://discord.gg/5bfhkJ3',
		votingChannel: 'votes',
	},
};

const prodFilesLocation = join(__dirname, '../../files');
const devFilesLocation = join(__dirname, '../../../../localization/files');
if (existsSync(prodFilesLocation)) {
	Config.localization.files = prodFilesLocation;
} else if (existsSync(devFilesLocation)) {
	Config.localization.files = devFilesLocation;
} else {
	console.log(readdirSync(join(__dirname, '../../../..')));
	throw new Error('localization files not found');
}
