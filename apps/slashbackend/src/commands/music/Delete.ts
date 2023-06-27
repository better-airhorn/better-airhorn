import { SoundCommand } from '@better-airhorn/entities';
import { AutocompleteContext, CommandContext, CommandOptionType, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { FindOptionsWhere, Like } from 'typeorm';
import { isAdmin } from '../../util/Utils';

@injectable()
export class DeleteCommand extends SlashCommand {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'delete',
			description: 'delete a sound',
			options: [
				{
					type: CommandOptionType.STRING,
					name: 'sound',
					description: 'Enter a sound!',
					required: true,
					autocomplete: true,
				},
			],
		});
	}

	public async autocomplete(ctx: AutocompleteContext) {
		const query: FindOptionsWhere<SoundCommand> = { name: Like(`${ctx.options.sound}%`), user: ctx.user.id };
		if (isAdmin(ctx.user.id)) {
			delete query.user;
		}
		const commands = await SoundCommand.find({
			where: query,
			take: 10,
		});
		return commands.map(command => ({ name: command.name, value: command.name }));
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		const command = await SoundCommand.findOne({ where: { name: ctx.options.sound } });
		if (!command) {
			await ctx.send(`found no sound named ${ctx.options.sound}`);
			return;
		}
		if (command.user !== ctx.user.id && !isAdmin(ctx.user.id)) {
			await ctx.send(`you are not the owner of ${ctx.options.sound}`);
			return;
		}
		await command.remove();
		await ctx.send('successfully deleted sound');
	}
}
