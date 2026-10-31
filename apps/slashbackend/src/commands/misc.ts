import type { CommandContext, SlashCreator } from 'slash-create';
import { env } from '../env';
import { reply, replyV2, UserError } from '../respond';
import { colors, container, linkButton, row, text } from '../ui';
import { inviteUrl, voteUrl } from '../util';
import { Command } from './base';

export class InviteCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, { name: 'invite', description: 'Add me to a server' });
	}

	public override async run(ctx: CommandContext) {
		await replyV2(ctx, [
			container(
				colors.brand,
				text('### Better Airhorn\nUpload your own sounds and play them in any voice channel.'),
				row(linkButton(inviteUrl(env.appId), 'Add to server'), linkButton(voteUrl(env.appId), 'Vote on top.gg')),
			),
		]);
	}
}

export class SyncCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, { name: 'sync', description: 'Re-sync slash commands (bot admins only)' });
	}

	public override async run(ctx: CommandContext) {
		if (!env.adminIds.includes(ctx.user.id)) throw new UserError('Only bot admins can do that.');
		await ctx.defer(true);
		await this.creator.syncCommands();
		await reply(ctx, 'Commands synced.');
	}
}
