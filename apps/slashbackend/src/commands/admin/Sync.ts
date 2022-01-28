import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';

@injectable()
export class SyncCommand extends SlashCommand {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'sync',
			description: 'sync slash commands',
		});
	}

	public async run(ctx: CommandContext) {
		this.creator.syncCommands();
		return ctx.send('synced commands');
	}
}
