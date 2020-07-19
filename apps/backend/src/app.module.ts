import { Guild, GuildSetting, Like, SoundCommand, Statistic, Usage } from '@better-airhorn/entities';
import { SSEMiddleware } from '@irreal/nestjs-sse';
import { BullModule } from '@nestjs/bull';
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from 'nestjs-redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { Config } from './Config';
import { GuildsController } from './controllers/guilds/guilds.controller';
import { PlayController } from './controllers/play/play.controller';
import { ChannelService } from './services/channel.service';
import { PlayQueueService } from './services/playQueue.service';

@Module({
	imports: [
		RedisModule.register({ url: Config.credentials.redis.url }),
		TypeOrmModule.forRoot({
			type: 'postgres',
			url: Config.credentials.pg.url,
			entities: [GuildSetting, Like, Statistic, SoundCommand, Usage, Guild],
			synchronize: process.env.NODE_ENV !== 'production',
		}),
		AuthModule,
		BullModule.registerQueue({
			name: Config.queue.playQueue.name,
			redis: Config.credentials.redis.url,
		}),
		BullModule.registerQueue({
			name: Config.queue.channelRequestQueue.name,
			redis: Config.credentials.redis.url,
		}),
	],
	controllers: [AppController, GuildsController, PlayController],
	providers: [AppService, ChannelService, PlayQueueService],
})
export class AppModule {
	public configure(consumer: MiddlewareConsumer) {
		consumer.apply(SSEMiddleware).forRoutes({ path: 'play/updates/:id', method: RequestMethod.GET });
	}
}
