import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { VoiceService } from '../../services/VoiceService';

@injectable()
export class SkipCommand extends SlashCommand {
	public constructor(creator: SlashCreator, private readonly voice: VoiceService) {
		super(creator, {
			name: 'skip',
			description: 'skip something in the queue',
		});
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		const skipped = (await this.voice.skip(ctx.guildID!)).unwrapOr(false);
		await ctx.send(skipped ? 'skipped sound' : 'there was nothing to skip');
	}
}
