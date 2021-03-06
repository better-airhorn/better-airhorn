import { convertToOGG, normalizeAudio } from '@better-airhorn/audio';
import { SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import ytdl, { chooseFormat, getInfo, validateURL, videoFormat, videoInfo } from 'ytdl-core';
import { Config } from '../../config/Config';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { HealthCheckGuard } from '../../guards/HealthCheckGuard';
import { LocalizationService } from '../../services/LocalizationService';
import { SoundFilesManager } from '../../services/SoundFilesManager';
import { getYoutubeContentSize } from '../../utils/AudioUtils';
import { getSubLogger } from '../../utils/Logger';
import { promptSoundCommandValues } from '../../utils/prompts/SoundCommandPrompts';

@Command('importyt', {
	channel: 'any',
	category: 'music',
	description: 'imports a sound from youtube.\nuse the `-n` parameter to normalize audio volume before importing',
	example: 'import https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	parseArguments: true,
})
export class ImportYTCommand extends CommandBase {
	private readonly log = getSubLogger(ImportYTCommand.name);

	public constructor(private readonly filesManager: SoundFilesManager, private readonly i18n: LocalizationService) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	@UseGuard(HealthCheckGuard)
	public async exec(message: Message, args: string[]): Promise<any> {
		if (!validateURL(args[0])) {
			return message.error(`Your link is invalid`);
		}
		const videoUrl = args.shift()!;
		let format: videoFormat;
		let info: videoInfo;
		try {
			info = await getInfo(videoUrl);
			format = chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
		} catch {
			return message.error('failed to locate or download audio');
		}

		const audioSize = parseInt(format.contentLength, 10) || (await getYoutubeContentSize(format));
		const audioLength: number = parseInt(
			format.approxDurationMs || info.formats.find(f => f.approxDurationMs)?.approxDurationMs || '',
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
		const loadingMsg = await message.neutral(this.i18n.t().commands.import.pleaseWaitDownloading);

		const entity = new SoundCommand({
			accessType: promptData.data.accessType,
			guild: message.guild!.id,
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
		await message.success(this.i18n.format('commands.import.savedSoundAs', { name: entity.name }));
	}
}
