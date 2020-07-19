import { Guild } from '@better-airhorn/entities';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscordService } from '../services/discord.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DiscordStrategy } from './discord/discord.strategy';
import { SessionSerializer } from './discord/session.serializer';

@Module({
	imports: [TypeOrmModule.forFeature([Guild])],
	providers: [AuthService, DiscordStrategy, AuthService, SessionSerializer, DiscordService],
	controllers: [AuthController],
})
export class AuthModule {}
