import { Message } from '@better-airhorn/shori';
import { MessageEmbed, MessageReaction, User } from 'discord.js';
import { EventEmitter } from 'typeorm/platform/PlatformTools';

type GeneratorCallback = (page: number) => Promise<MessageEmbed | void>;

export class PageabelEmbed extends EventEmitter {
	private currentPage = 1;
	public constructor(
		public readonly msg: Message,
		private readonly generator: GeneratorCallback,
		private readonly user: string,
	) {
		super();
	}

	public async start() {
		this.msg
			.createReactionCollector(
				(r: MessageReaction, u: User) => ['◀', '▶'].includes(r.emoji.name) && u.id === this.user,
				{ idle: 120_000 },
			)
			.on('collect', async (r: MessageReaction, u: User) => {
				await r.users.remove(u).catch(() => null);
				switch (r.emoji.name) {
					case '▶': {
						const newContent = await this.generator(this.currentPage + 1).catch(e => e);
						if (newContent instanceof MessageEmbed) {
							this.currentPage++;
							await this.msg.edit(newContent);
						} else if (typeof newContent === 'undefined') {
						} else {
							this.emit('error', newContent);
						}
						break;
					}
					case '◀': {
						const newContent = await this.generator(this.currentPage - 1).catch(e => e);
						if (newContent instanceof MessageEmbed) {
							this.currentPage--;
							await this.msg.edit(newContent);
						} else if (typeof newContent === 'undefined') {
						} else {
							this.emit('error', newContent);
						}
						break;
					}
				}
			});
		await this.msg.react('◀');
		await this.msg.react('▶');
		const newContent = await this.generator(this.currentPage).catch(e => e);
		if (newContent instanceof MessageEmbed) {
			await this.msg.edit(newContent);
		} else if (typeof newContent === 'undefined') {
		} else {
			this.emit('error', newContent);
		}
		return this;
	}
}
