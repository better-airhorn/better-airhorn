import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { Config } from '../../Config';

@injectable()
export class SyncCommand extends SlashCommand {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'sync',
			description: 'sync slash commands',
		});
	}

	public async run(ctx: CommandContext) {
		if (!Config.admins.includes(ctx.user.id)) {
			return ctx.send("I don't think you can do that...");
		}
		this.creator.syncCommands();
		return ctx.send('synced commands');
	}
}
