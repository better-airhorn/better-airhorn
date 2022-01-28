import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { VoiceService } from '../../services/VoiceService';

@injectable()
export class LeaveCommand extends SlashCommand {
	public constructor(creator: SlashCreator, private readonly voice: VoiceService) {
		super(creator, {
			name: 'leave',
			description: 'leave the voice channel',
		});
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		await this.voice.leave(ctx.guildID!);
		await ctx.send('left voice channel!');
	}
}
