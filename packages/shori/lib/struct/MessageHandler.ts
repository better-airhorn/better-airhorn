import { EventEmitter } from 'events';
import parseArgs from 'minimist';
import { CommandBase } from '..';
import { ShoriClient } from '../client/ShoriClient';
import { commandMap } from '../Lists/CommandsList';
import { Event } from '../struct/decorators/Events';
import { Message } from './DiscordExtends/Message';
const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface IEvents {
	reject: (command: CommandBase, message: Message) => any;
	error: (e: Error, command: CommandBase, message: Message) => any;
	success: (command: CommandBase, returnvalue: Promise<any>, message: Message) => any;
}

export class MessageHandler extends EventEmitter {
	private readonly _untypedOn = this.on;
	private readonly _untypedEmit = this.emit;
	public on = <K extends keyof IEvents>(event: K, listener: IEvents[K]): this => this._untypedOn(event, listener);
	public emit = <K extends keyof IEvents>(event: K, ...args: Parameters<IEvents[K]>): boolean =>
		this._untypedEmit(event, ...args);

	@Event('message')
	public async onMessage(message: Message): Promise<void> {
		if (message.author.bot) return;
		if (!message.channel.sendable) return;
		message.eventEmittedAt = Date.now();
		const client = message.client as ShoriClient;
		const prefix =
			(await client.getPrefix((message.guild || message.channel).id).catch(() => undefined)) ?? client.prefix;
		const prefixRegex = new RegExp(`^(<@!?${client.user.id}>|${escapeRegex(prefix)})\\s*`);
		if (!prefixRegex.test(message.content)) return;

		const [, matchedPrefix] = prefixRegex.exec(message.content);
		const args = message.content
			.slice(matchedPrefix.length)
			.trim()
			.split(/ +/);
		const command = args.shift().toLowerCase();
		const cmd = commandMap.get(command);

		if (!cmd) return;
		const { channel, author, member, guild } = message;
		if (!cmd.class.client) {
			cmd.class.client = client;
		}
		if (cmd.class.channel === 'guild' && message.channel.type !== 'text') return;
		// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
		// @ts-ignore
		if (cmd.class.channel === 'dm' && message.channel.type !== 'dm') return;

		if (cmd.class.onlyOwner && !client.ownerIds.includes(author.id)) {
			if (channel.sendable) {
				message.error('This command is restricted to the Owners.').catch(() => null);
			}
			return;
		}

		let missingPermissionsMember: string[] = channel.permissionsFor(member).missing(cmd.class.userChannelPermissions);
		missingPermissionsMember.push(...member.permissions.missing(cmd.class.userPermissions));
		missingPermissionsMember = missingPermissionsMember
			.filter((permission, index) => missingPermissionsMember.indexOf(permission) === index)
			.map(value => value.toLocaleLowerCase().replace('_', ' '));

		let missingPermissionsBot: string[] = channel.permissionsFor(guild.me).missing(cmd.class.botChannelPermissions);
		missingPermissionsBot.push(...guild.me.permissions.missing(cmd.class.botPermissions));
		missingPermissionsBot = missingPermissionsBot
			.filter((permission, index) => missingPermissionsBot.indexOf(permission) === index)
			.map(value => value.toLocaleLowerCase().replace('_', ' '));

		if (missingPermissionsBot.length > 0) {
			await message.error(`I am missing the following permissions: \`\`\`${missingPermissionsBot.join()}\`\`\``);
			return;
		}
		if (missingPermissionsMember.length > 0) {
			await message.error(`You are missing the following permissions: \`\`\`${missingPermissionsMember.join()}\`\`\``);
			return;
		}

		const allowCommand = await Promise.all(cmd.class.guards.map(instance => instance.canActivate(message, args)));
		if (!allowCommand.every(Boolean)) {
			this.emit('reject', cmd.class, message);
			return;
		}
		if (cmd.class.parseArguments) {
			message.arguments = parseArgs(args);
		}
		try {
			const res = await cmd.class.exec(message, args);
			this.emit('success', cmd.class, res, message);
		} catch (e) {
			this.emit('error', e, cmd.class, message);
		}
	}
}
