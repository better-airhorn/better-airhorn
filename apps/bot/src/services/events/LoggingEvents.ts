import { Client, CommandBase, Event, Message, MessageHandler, resolveSingleton, Service } from '@better-airhorn/shori';
import { BAClient } from '../../client/BAClient';
import { Config } from '../../config/Config';
import { getSubLogger, logger } from '../../utils/Logger';

@Service()
export class LoggingEvents {
	private readonly log = getSubLogger(LoggingEvents.name);

	@Client()
	private readonly client!: BAClient;

	@Event('success', {
		source: resolveSingleton(MessageHandler),
		once: false,
	})
	public async onCommandRan(cmd: CommandBase, _result: Promise<any>, message: Message): Promise<void> {
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
			guild: msg.guild!.id,
			channel: msg.channel.id,
		});
		await msg
			.error(
				`There was an error while executing the ${command.name} command.\nIf this keeps happening *please* report this [in the support server](${Config.misc.supportServerUrl})`,
			)
			.catch(() => null);
	}

	@Event('reject', {
		source: resolveSingleton(MessageHandler),
		once: false,
	})
	public onCommandReject(cmd: CommandBase, message: Message): void {
		this.log.debug(`rejected command ${cmd.name} from ${message.author.id}`);
	}

	@Event('ready')
	public async onReady(): Promise<void> {
		this.log.info(`client ready as ${this.client.user!.tag}`);
		setTimeout(() => {
			this.client.user?.setPresence({ status: 'online' }).catch(() => null);
		}, 10_000);
	}

	@Event('error')
	public onError(error: any): void {
		this.log.warn(error);
	}

	@Event('disconnect')
	public onDisconnect(_: any, id: number): void {
		this.log.error(`shard ${id} disconnected`);
	}

	@Event('unhandledRejection', {
		source: process,
		once: false,
	})
	public onUnhandledRejection(reason: Error | any) {
		if (reason instanceof Error) {
			logger.error(`${reason.message}\n${reason.stack}`);
			return;
		}
		logger.error(reason);
	}
}
