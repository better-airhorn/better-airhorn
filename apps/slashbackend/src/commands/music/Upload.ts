import { ApplicationCommandType, CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';

@injectable()
export class UploadCommand extends SlashCommand {
	public constructor(creator: SlashCreator) {
		super(creator, {
			type: ApplicationCommandType.MESSAGE,
			name: 'upload sound attachment',
		});
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		// TODO: implement this lol
	}
}
