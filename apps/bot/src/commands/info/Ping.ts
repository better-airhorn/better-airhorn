import { GuildSetting } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { getRepository } from 'typeorm';
import { LocalizationService } from '../../services/LocalizationService';
import { MinIOService } from '../../services/MinIOService';

@Command('ping', {
	channel: 'any',
	category: 'info',
	description: 'gets latency to discord api and other various services',
	showInHelp: false,
})
export class PingCommand extends CommandBase {
	public constructor(private readonly minIOService: MinIOService, private readonly i18n: LocalizationService) {
		super();
	}

	public async exec(message: Message): Promise<any> {
		const startTime = Date.now();
		const processTime = startTime - message.eventEmittedAt!;
		await getRepository(GuildSetting)
			.findOne()
			.catch(() => null);
		const pgPing = Date.now() - startTime;
		return message.channel.send(
			this.i18n.format('commands.ping.generalPingInformation', {
				processTime: processTime.toString(),
				discordPing: this.client.ws.ping.toString(),
				pgPing: pgPing.toString(),
				minIOPing: await (await this.minIOService.pseudoPing()).toString(),
			}),
		);
	}
}
