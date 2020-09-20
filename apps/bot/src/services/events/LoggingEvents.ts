import { Client, CommandBase, Event, Message, MessageHandler, resolveSingleton, Service } from '@better-airhorn/shori';
import { BAClient } from '../../client/BAClient';
import { logger } from '../../utils/Logger';

@Service()
export class LoggingEvents {
	private readonly log = logger.child({ labels: { source: LoggingEvents.name } });

	@Client()
	private readonly client: BAClient;

	@Event('success', {
		source: resolveSingleton(MessageHandler),
		once: false,
	})
	public onCommandRan(cmd: CommandBase, _result: Promise<any>, message: Message): void {
		this.log.debug(`successfully ran ${cmd.name} for ${message.author.id}`);
	}

	@Event('error', {
		source: resolveSingleton(MessageHandler),
		once: false,
	})
	public async onCommandError(e: Error, command: CommandBase, msg: Message): Promise<void> {
		this.log.error(`error executing command ${command.name}\n${e.message}\n${e.stack}`, {
			content: msg.content,
			author: msg.author.id,
			guild: msg.guild.id,
			channel: msg.channel.id,
		});
		await msg.error(`There was an error while executing the ${command.name} command`).catch(() => null);
	}

	@Event('reject', {
		source: resolveSingleton(MessageHandler),
		once: false,
	})
	public onCommandReject(cmd: CommandBase, message: Message): void {
		this.log.debug(`rejected command ${cmd.name} from ${message.author.id}`);
	}

	@Event('ready')
	public onReady(): void {
		this.log.info(`client ready as ${this.client.user.tag}`);
	}

	@Event('error')
	public onError(error: any): void {
		this.log.warn(error);
	}

	@Event('disconnect')
	public onDisconnect(_: any, id: number): void {
		this.log.error(`shard ${id} disconnected`);
	}
}
