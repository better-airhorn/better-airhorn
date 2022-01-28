import { ButtonStyle, CommandContext, ComponentType, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { Config } from '../../Config';

@injectable()
export class InviteCommand extends SlashCommand {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'invite',
			description: 'create an invite for this bot',
		});
	}

	public async run(ctx: CommandContext) {
		const inviteString = `https://discord.com/api/oauth2/authorize?client_id=${Config.credentials.discord.appId}&permissions=274881431616&scope=bot%20applications.commands`;
		await ctx.send(`Thanks for inviting me!`, {
			components: [
				{
					type: ComponentType.ACTION_ROW,
					components: [
						{
							type: ComponentType.BUTTON,
							style: ButtonStyle.LINK,
							label: 'Invite me',
							url: inviteString,
						},
					],
				},
			],
		});
	}
}
