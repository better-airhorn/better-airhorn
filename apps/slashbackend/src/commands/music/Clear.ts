import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { VoiceService } from '../../services/VoiceService';

@injectable()
export class ClearCommand extends SlashCommand {
	public constructor(creator: SlashCreator, private readonly voice: VoiceService) {
		super(creator, {
			name: 'clear',
			description: 'clear the queue',
		});
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		await this.voice.clear(ctx.guildID!);
		await ctx.send('cleared queue!');
	}
}
