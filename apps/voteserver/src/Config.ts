export const Config = {
	port: 7777,
	credentials: {
		postgres: process.env.PG!,
		redis: process.env.REDIS!,
		secrets: {
			topgg: process.env.SECRETS_TOPGG!,
		},
	},
	logging: {
		level: 'debug',
	},

	redis: {
		voteChannel: 'votes',
	},
};
