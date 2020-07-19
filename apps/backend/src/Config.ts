import { Logger } from '@nestjs/common';

// if no keys are given, generate random ones
let singingKeys = process.env.SIGNING_KEYS?.split(',');
if ((singingKeys?.length || 0) < 1) {
	Logger.warn('generating random keys');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	singingKeys = require('crypto')
		.randomBytes(30)
		.toString('base64')
		.match(/.{1,10}/g);
}

export const Config = {
	sessions: {
		singingKeys,
		expires: 1000 * 60 * 60 /* one hour */ * 24 * 5,
	},

	queue: {
		playQueue: {
			name: 'play',
			simulationsProcessors: 25,
			lockKeyGenerator: (channelId: string, guildId: string): string => `ba:guild:lock:${guildId}`,
		},
		channelRequestQueue: {
			name: 'channel-request',
		},
	},

	credentials: {
		redis: {
			url: process.env.REDIS_URL,
		},
		pg: {
			url: process.env.PG_URL,
		},
	},
};
