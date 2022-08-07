import { SoundCommand, AccessType } from '@better-airhorn/entities';
import { AutocompleteContext, CommandContext, CommandOptionType, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { Like } from 'typeorm';
import { VoiceService } from '../../services/VoiceService';
import { humanFileSize, msToMinutes, wrapInCodeBlock } from '../../util/Utils';

@injectable()
export class InfoCommand extends SlashCommand {
	public constructor(creator: SlashCreator, private readonly voice: VoiceService) {
		super(creator, {
			name: 'info',
			description: 'shows info about a sound',
			options: [
				{
					type: CommandOptionType.STRING,
					name: 'sound',
					description: 'Enter a sound!',
					required: true,
					autocomplete: true,
				},
			],
		});
	}

	public async autocomplete(ctx: AutocompleteContext) {
		const commands = await SoundCommand.find({
			where: { name: Like(`${ctx.options[ctx.focused]}%`) },
			take: 10,
		});
		return commands.map(command => ({ name: command.name, value: command.name }));
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		const sound = await SoundCommand.findOne({ where: { name: ctx.options.sound } });
		if (!sound) {
			return ctx.send(`No sound found with name ${ctx.options.sound}`);
		}
		await ctx.send({
			embeds: [
				{
					description: `
    ID: ${sound.id}
    Name: ${wrapInCodeBlock(sound.name, { inline: true })}
    Access: ${sound.accessType === AccessType.ONLY_GUILD ? 'Specific Guild Only' : 'Everyone'}
    Size: ${humanFileSize(sound.size)}
    Length: ${msToMinutes(sound.duration)}
    Uploader: ${(await this.voice.getUser(sound.user)).unwrapOr({ tag: 'Unknown User' }).tag}
    Uses: ${sound.uses}
    Likes: ${(await sound.likes).length}
    `,
				},
			],
		});
	}
}
