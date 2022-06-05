export const Config = {
	port: 7777,
	credentials: {
		postgres: `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@postgres:5432/postgres`,
		redis: `redis://:${process.env.REDIS_PASSWORD}@redis:6379`,
		secrets: {
			topgg: process.env.BOTLISTS_DBL_SECRET!,
		},
	},
	logging: {
		level: 'debug',
	},

	redis: {
		voteChannel: 'votes',
	},
};
