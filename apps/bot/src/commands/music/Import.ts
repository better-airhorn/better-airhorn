import { convertToOGG } from '@better-airhorn/audio';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { Config } from '../../config/Config';
import { HealthCheckGuard } from '../../guards/HealthCheckGuard';
import { importAudioFile } from '../../utils/prompts/SoundCommandPrompts';
import { humanFileSize, wrapInCodeBlock } from '../../utils/Utils';

@Command('import', {
	channel: 'any',
	category: 'music',
	description: 'imports a sound from the prior messages',
	example: 'import https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	parseArguments: true,
})
export class ImportCommand extends CommandBase {
	@UseGuard(HealthCheckGuard)
	public async exec(message: Message): Promise<any> {
		const messages = await message.channel.messages.fetch({ limit: 30 });
		const messagesWithAttachments = messages
			.sort((a, b) => b.createdTimestamp - a.createdTimestamp)
			.filter(msg => msg.attachments.size > 0);

		if (messagesWithAttachments.size < 1) {
			return message.warn(
				"I can't find any message with attachments",
				'I looked trough the last 30 messages in this channel',
			);
		}

		const messagesWithSuitableFormats = messagesWithAttachments
			.map(msg => ({
				attach: msg.attachments.find(x => convertToOGG.supportedFormats.includes(x.name!.split('.').pop()!))!,
				msg,
			}))
			.filter(entry => entry.attach);
		if (messagesWithSuitableFormats.length < 1) {
			return message.warn(
				`I can't find any attachments with supported file formats.\nmake sure its format is one of those:\n${wrapInCodeBlock(
					convertToOGG.supportedFormats.join('\n'),
				)}`,
			);
		}

		const suitable = messagesWithSuitableFormats[0];
		if (suitable.attach?.size > Config.files.maxFileSize) {
			return message.error(
				`[The Attachment](${suitable.msg.url}) I found is too big`,
				`Try something smaller than ${humanFileSize(Config.files.maxFileSize)}`,
			);
		}

		await importAudioFile({ attachment: suitable.attach, message: suitable.msg as Message });
	}
}
