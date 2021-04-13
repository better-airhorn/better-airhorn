import { convertToOGG } from '@better-airhorn/audio';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { Collection, MessageAttachment, Snowflake } from 'discord.js';
import { Config } from '../../config/Config';
import { HealthCheckGuard } from '../../guards/HealthCheckGuard';
import { importAudioFile } from '../../utils/prompts/SoundCommandPrompts';
import { humanFileSize, wrapInCodeBlock } from '../../utils/Utils';

@Command('import', {
	channel: 'any',
	category: 'music',
	description: 'imports a sound from the prior messages or from a replied messages',
	example: 'import https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	parseArguments: true,
})
export class ImportCommand extends CommandBase {
	@UseGuard(HealthCheckGuard)
	public async exec(message: Message): Promise<any> {
		let suitable: MessageWithAttachment;
		if (message.reference?.messageID) {
			const refMessage = (await message.channel.messages.fetch(message.reference.messageID)) as Message;
			if (refMessage.attachments.size < 1) {
				return message.warn("I can't find any attachments on the message you referenced");
			}

			const suitableAttachment = refMessage.attachments.find(x =>
				convertToOGG.supportedFormats.includes(x.name!.split('.').pop()!),
			);
			if (!suitableAttachment) {
				return message.warn(
					`I can't find any attachments with supported file formats.\nmake sure its format is one of those:\n${wrapInCodeBlock(
						convertToOGG.supportedFormats.join('\n'),
					)}`,
				);
			}
			suitable = { attach: suitableAttachment, msg: refMessage };
		} else {
			const messages = (await message.channel.messages.fetch({ limit: 30 })) as Collection<Snowflake, Message>;
			const msg = await this.findSuitableMessage(messages, message);
			if (!msg) return;
			suitable = msg;
		}

		if (suitable.attach?.size > Config.files.maxFileSize) {
			return message.error(
				`[The Attachment](${suitable.msg.url}) I found is too big`,
				`Try something smaller than ${humanFileSize(Config.files.maxFileSize)}`,
			);
		}

		await importAudioFile({ attachment: suitable.attach, message: suitable.msg as Message });
	}

	private async findSuitableMessage(
		messages: Collection<Snowflake, Message>,
		originalMessage: Message,
	): Promise<MessageWithAttachment | null> {
		const messagesWithAttachments = messages
			.sort((a, b) => b.createdTimestamp - a.createdTimestamp)
			.filter(msg => msg.attachments.size > 0);

		if (messagesWithAttachments.size < 1) {
			await originalMessage.warn(
				"I can't find any message with attachments",
				'I looked trough the last 30 messages in this channel',
			);
			return null;
		}

		const messagesWithSuitableFormats = messagesWithAttachments
			.map(msg => ({
				attach: msg.attachments.find(x => convertToOGG.supportedFormats.includes(x.name!.split('.').pop()!))!,
				msg,
			}))
			.filter(entry => entry.attach);
		if (messagesWithSuitableFormats.length < 1) {
			await originalMessage.warn(
				`I can't find any attachments with supported file formats.\nmake sure its format is one of those:\n${wrapInCodeBlock(
					convertToOGG.supportedFormats.join('\n'),
				)}`,
			);
			return null;
		}
		return messagesWithSuitableFormats[0];
	}
}

interface MessageWithAttachment {
	attach: MessageAttachment;
	msg: Message;
}
