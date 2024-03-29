export const Config = {
	credentials: {
		discord: {
			token: process.env.DISCORD_TOKEN!,
		},
		accessKey: process.env.VOICENODE_ACCESS_KEY!,
		postgres: `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@postgres:5432/postgres`,
		minio: {
			url: 'minio',
			port: 9000,
			accessKey: process.env.MINIO_ACCESS_KEY!,
			secretKey: process.env.MINIO_SECRET_KEY!,
			bucketName: process.env.MINIO_BUCKETNAME!,
		},
	},
};
