import { Command, CommandBase, commandMap, Message } from '@better-airhorn/shori';
import { stripIndents } from 'common-tags';
import { MessageEmbed } from 'discord.js';
import { Config } from '../../config/Config';

@Command('help', {
	userPermissions: [],
	category: 'misc',
	example: 'help [command]',
	description: 'show information about a specific command or a quick overview of all of them',
})
export class HelpCommand extends CommandBase {
	public async exec(message: Message, args: string[]): Promise<any> {
		if (args.length > 0) {
			const { class: cmd } = commandMap.get(args[0].toLowerCase());
			if (!cmd) {
				return message.warn(`can\'t find a command named "${args[0].toLowerCase()}"`);
			}
			return message.channel.send(
				new MessageEmbed()
					.setColor(Config.colors.neutral)
					.setTitle(`${cmd.name} Help Page`)
					.setDescription(
						stripIndents`
                    Category: ${cmd.category}
                    Description: ${cmd.description}
                    ${cmd.example ? `Example: ${cmd.example}` : ''}
                    `,
					),
			);
		}

		return message.channel.send(
			new MessageEmbed()
				.setColor(Config.colors.neutral)
				.setTitle('All Commands')
				.setDescription(
					`${[...commandMap.values()]
						.filter(v => v.class.showInHelp)
						.map(v => `**${v.class.name}**\n${v.class.description}`)
						.join('\n\n')}\n\n***run \`help <command name>\` for detailed information***`,
				),
		);
	}
}
