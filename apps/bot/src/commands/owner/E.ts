/* eslint-disable @typescript-eslint/no-unused-vars */
import { Guild as GuildEntity, GuildSetting, SoundCommand, Statistic, Usage } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { getRepository, Like } from 'typeorm';
import util from 'util';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { logger } from '../../utils/Logger';
import { TextUploadService } from '../../utils/TextUploadService';

@Command('e', {
	channel: 'any',
	category: 'owner',
	example: 'e client.uptime',
	description: 'executes javascript',
	onlyOwner: true,
	showInHelp: false,
})
export class ECommand extends CommandBase {
	public constructor(private readonly uploader: TextUploadService) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const m = await message.channel.send('evaluating...');
		let evaled: any;
		const context = {
			msg: message,
			getRepository,
			entities: [GuildSetting, Like, Statistic, SoundCommand, Usage, GuildEntity],
			logger,
		};
		try {
			// eslint-disable-next-line no-eval
			evaled = eval(args.join(' '));
			if (evaled instanceof Promise) evaled = await evaled;
		} catch (err) {
			evaled = err.message;
		}

		const cleaned = await this.clean(evaled);
		if (cleaned.length > 1950) {
			const hastebin = `${this.uploader.base}/${await this.uploader.upload(cleaned)}`;
			return m.edit(hastebin);
		}

		return m.edit(cleaned);
	}

	public async clean(text: any): Promise<string> {
		if (
			Boolean(text) &&
			Boolean(text.constructor) &&
			(text.constructor.name === 'Promise' || text.constructor.name === 'WrappedPromise')
		) {
			text = await text;
		}

		if (typeof text !== 'string') {
			text = util.inspect(text, {
				depth: 2,
			});
		}

		text = text
			.replace(/`/g, `\`${String.fromCharCode(8203)}`)
			.replace(/@/g, `@${String.fromCharCode(8203)}`)
			.replace(process.env.PG, '// ---------- NO ---------- //')
			.replace(process.env.DISCORD_TOKEN, '// ---------- NO ---------- //')
			.replace(process.env.MINIO_AK, '// ---------- NO ---------- //')
			.replace(process.env.MINIO_SK, '// ---------- NO ---------- //')
			.replace(process.env.MINIO_URL, '// ---------- NO ---------- //');

		return text;
	}
}
