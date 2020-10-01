import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { MessageEmbed } from 'discord.js';
import fetch from 'node-fetch';
import { Config } from '../../config/Config';
import { wrapInCodeBlock } from '../../utils/Utils';

@Command('status', {
	channel: 'any',
	category: 'info',
	description: 'gets status of all services related to better airhorn',
	showInHelp: false,
})
export class StatusCommand extends CommandBase {
	public async exec(message: Message): Promise<any> {
		const result = await fetch(Config.credentials.statping.url).then(r => r.json());
		return message.channel.send(
			new MessageEmbed().setDescription(
				wrapInCodeBlock(`${result.map((v: any) => `${v.online ? '✅' : '❌'} ${v.name}`).join('\n')}`),
			),
		);
	}
}
