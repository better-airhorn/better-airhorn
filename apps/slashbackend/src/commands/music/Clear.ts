import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { VoiceService } from '../../services/VoiceService';
import { getSubLogger } from '../../util/Logger';

@injectable()
export class ClearCommand extends SlashCommand {
	private readonly log = getSubLogger(ClearCommand.name);
	public constructor(creator: SlashCreator, private readonly voice: VoiceService) {
		super(creator, {
			name: 'clear',
			description: 'clear the queue',
		});
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		const result = await this.voice.clear(ctx.guildID!);
		if (result.err) {
			this.log.error(result);
			return ctx.send('failed to clear queue');
		}
		await ctx.send('cleared queue!');
	}
}
