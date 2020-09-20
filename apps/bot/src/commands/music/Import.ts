import { convertToOGG, normalizeAudio } from '@better-airhorn/audio';
import { SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import ytdl, { getInfo, videoFormat, videoInfo } from 'ytdl-core';
import { Config } from '../../config/Config';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { SoundFilesManager } from '../../services/SoundFilesManager';
import { logger } from '../../utils/Logger';
import { promptSoundCommandValues } from '../../utils/prompts/SoundCommandPrompts';
import { getYoutubeContentSize } from '../../utils/YoutubeUtils';

@Command('import', {
	channel: 'any',
	category: 'music',
	description: 'imports a sound from youtube.\nuse the `-n` parameter to normalize audio level before importing',
	example: 'import https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	parseArguments: true,
})
export class ImportCommand extends CommandBase {
	private readonly log = logger.child({ labels: { source: ImportCommand.name } });

	public constructor(private readonly filesManager: SoundFilesManager) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const videoUrl = args.shift();
		let format: videoFormat;
		let info: videoInfo;
		try {
			info = await getInfo(videoUrl);
			format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
		} catch {
			return message.error('failed to locate or download audio');
		}

		const audioSize = parseInt(format.contentLength, 10) || (await getYoutubeContentSize(format));
		const audioLength = parseInt(
			format.approxDurationMs || info.formats.find(f => f.approxDurationMs)?.approxDurationMs,
			10,
		);
		if (
			(audioSize > Config.files.maxFileSize && !Number.isNaN(audioSize)) ||
			(Number.isNaN(audioSize) && audioLength >= 600_000)
		) {
			return message.error(`the provided audio is too big/long`);
		}
		if (!audioSize && !audioLength) {
			return message.error(`I wasn\'t able to get the audios size or length, blame youtube!`);
		}

		const promptData = await promptSoundCommandValues(message);
		if (!promptData.ok) {
			return this.log.error(promptData.err);
		}
		if (!promptData.data) return;
		const loadingMsg = await message.neutral(
			`Please wait, I'm downloading and converting your video ${Config.emojis.loading}`,
		);

		const entity = new SoundCommand({
			accessType: promptData.data.accessType,
			guild: message.guild.id,
			name: promptData.data.name,
			user: message.author.id,
			duration: 0,
			size: 0,
		});
		await entity.save();
		const normalize = 'n' in message.arguments || 'normalize-audio' in message.arguments;
		const { stream: oggStream, duration } = await convertToOGG(ytdl(videoUrl, { format }));
		await this.filesManager.set(entity.id, normalize ? await normalizeAudio(oggStream) : oggStream);
		entity.duration = await duration;
		entity.size = (await this.filesManager.stat(entity.id)).size;
		await entity.save();
		await loadingMsg.delete();
		await message.success(`I saved your sound as \`${entity.name}\``);
	}
}
