import { GuildSetting } from '@better-airhorn/entities';
import { Body, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { GuildSettingDTO } from '../../dtos/GuildSettingsDTO';
import { LocalGuard } from '../../guards/auth.guard';
import { GuildOwnerGuard } from '../../guards/guild-owner.guard';
import { ChannelService } from '../../services/channel.service';
import { IRequest } from '../../structures/http/Request';

@UseGuards(LocalGuard)
@Controller('guilds')
export class GuildsController {
	public constructor(private readonly channelService: ChannelService) {}

	@Get()
	public getSharedGuilds(@Req() req: IRequest) {
		return req.user.guilds;
	}

	@Get(':guild')
	public getGuild(@Req() req: IRequest, @Param('guild') guild: string) {
		const guildObj = req.user.guilds.find(g => g.id === guild);
		if (guildObj) return guildObj;
		throw new NotFoundException();
	}

	@Get(':guild/settings')
	@UseGuards(GuildOwnerGuard)
	public async getChannels(@Param('guild') guild: string) {
		const settings = await getRepository(GuildSetting).findOne(guild);
		if (!settings) throw new NotFoundException(`settings for ${guild} not found`);
		return settings;
	}

	@Patch(':guild/settings')
	@UseGuards(GuildOwnerGuard)
	public async getSettings(@Param('guild') guild: string, @Body() newSettings: GuildSettingDTO) {
		await getRepository(GuildSetting).save({ ...newSettings, guild: guild });
		return getRepository(GuildSetting).findOne(guild);
	}
}
