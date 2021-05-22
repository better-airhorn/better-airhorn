import { BitFieldResolvable, IntentsString } from 'discord.js';
import fileSize from 'filesize-parser';
import { existsSync } from 'fs';
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
			simulationsProcessors: 25,
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
			url: process.env.PG!,
		},

		redis: {
			url: process.env.REDIS!,
		},

		discord: {
			token: process.env.DISCORD_TOKEN!,
		},

		minio: {
			accessKey: process.env.MINIO_AK!,
			secretKey: process.env.MINIO_SK!,
			url: process.env.MINIO_URL?.split(':')[0]!,
			port: parseInt(process.env.MINIO_URL?.split(':')[1] ?? '8500', 10),
		},
		loki: {
			url: process.env.LOKI_URL!,
		},
		statping: {
			url: process.env.STATPING_URL!,
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
	throw new Error('localization files not found');
}
