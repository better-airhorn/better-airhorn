export const Config = {
	credentials: {
		discord: {
			token: process.env.DISCORD_TOKEN!,
		},

		minio: {
			accessKey: process.env.MINIO_ROOT_USER!,
			secretKey: process.env.MINIO_ROOT_PASSWORD!,
			url: process.env.MINIO_URL?.split(':')[0]!,
			port: parseInt(process.env.MINIO_URL?.split(':')[1] ?? '8500', 10),
		},
	},
};
