import type { CommandContext, SlashCreator } from 'slash-create';
import { voice } from '../env';
import { reply, UserError } from '../respond';
import { hasAnyPermission, permissions } from '../util';
import { Command, guildOf, guildOnly } from './base';

/** members control playback only from the bot's channel, unless they can manage the server */
async function assertControl(ctx: CommandContext): Promise<string> {
	const guild = guildOf(ctx);
	const member = await voice.member(guild, ctx.user.id);
	if (!member.botVoiceChannelId) throw new UserError("I'm not in a voice channel right now.");
	const manager = hasAnyPermission(ctx.member?.permissions.valueOf(), permissions.MANAGE_GUILD);
	if (!manager && member.voiceChannelId !== member.botVoiceChannelId) {
		throw new UserError(`Join <#${member.botVoiceChannelId}> to control playback.`);
	}
	return guild;
}

export class SkipCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, { name: 'skip', description: 'Skip the sound that is playing', ...guildOnly });
	}

	public override async run(ctx: CommandContext) {
		const { skipped } = await voice.skip(await assertControl(ctx));
		await reply(ctx, { content: skipped ? '⏭️ Skipped.' : 'Nothing is playing.', ephemeral: false });
	}
}

export class ClearCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, { name: 'clear', description: 'Stop playing and empty the queue', ...guildOnly });
	}

	public override async run(ctx: CommandContext) {
		await voice.clear(await assertControl(ctx));
		await reply(ctx, { content: '⏹️ Stopped and cleared the queue.', ephemeral: false });
	}
}

export class LeaveCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, { name: 'leave', description: 'Make me leave the voice channel', ...guildOnly });
	}

	public override async run(ctx: CommandContext) {
		await voice.leave(await assertControl(ctx));
		await reply(ctx, { content: '👋 Left the voice channel.', ephemeral: false });
	}
}
