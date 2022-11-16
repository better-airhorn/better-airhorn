import { AccessType, SoundCommand } from '@better-airhorn/entities';
import { CommandContext, CommandOptionType, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { Config } from '../../Config';
import { VoiceService } from '../../services/VoiceService';
import { getSubLogger } from '../../util/Logger';
import { humanFileSize, wrapInCodeBlock } from '../../util/Utils';
@injectable()
export class UploadCommand extends SlashCommand {
	private readonly LOG = getSubLogger(this.constructor.name);
	public constructor(creator: SlashCreator, private readonly voice: VoiceService) {
		super(creator, {
			name: 'upload',
			description: 'upload a sound',
			options: [
				{
					type: CommandOptionType.ATTACHMENT,
					name: 'file',
					description: 'select a sound file',
					required: true,
				},
				{
					type: CommandOptionType.STRING,
					name: 'name',
					description: 'Enter a name for the sound!',
					required: true,
				},
				{
					type: CommandOptionType.BOOLEAN,
					name: 'private',
					description: 'Should the sound be only for this guild?',
					required: false,
				},
			],
		});
	}

	private readonly supportedFormats = ['aac', 'ac3', 'flac', 'mp3', 'ogg', 'opus', 'wav', 'wma'];
	public async run(ctx: CommandContext) {
		await ctx.defer();
		const { file: fileId, name, private: isPrivate } = ctx.options as {
			file: string;
			name: string;
			private: boolean;
		};
		isPrivate;
		const file = ctx.attachments.get(fileId);
		if (!file) {
			return ctx.send('No file found!');
		}
		if (await SoundCommand.findOne({ where: { name } })) {
			return ctx.send('that name is already in use!\nuse the /info command to test if a name is free');
		}
		if (!this.supportedFormats.includes(file.filename.split('.').pop()!)) {
			return ctx.send(
				`that file type is not supported!\ntry one of the following: ${wrapInCodeBlock(
					this.supportedFormats.join(', '),
				)}`,
			);
		}
		if (file.size > Config.limitations.maxSingleFileSize) {
			return ctx.send(`that file is too big! (max ${humanFileSize(Config.limitations.maxSingleFileSize)})`);
		}
		const sound = SoundCommand.create({
			accessType: isPrivate ? AccessType.ONLY_GUILD : AccessType.EVERYONE,
			name,
			size: file.size,
			user: ctx.user.id,
			guild: ctx.guildID,
			duration: 0,
		});
		await sound.save();
		try {
			const result = await this.voice.waitForImport({ objectName: sound.id.toString(), url: file.url });
			if (result.status === 'error') {
				throw new Error(`couldn't import file ${JSON.stringify(result)}`);
			}
			console.log(result);
			sound.duration = result.duration;
			await sound.save();
			return ctx.send(`uploaded ${name}!`);
		} catch (e) {
			this.LOG.error(e);
			await sound.remove();
			return ctx.send('Something went wrong!');
		}
	}
}
