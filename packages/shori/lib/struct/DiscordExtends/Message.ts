import { Client, Message as DMessage, MessageEmbed, Structures } from 'discord.js';
import { TextChannel } from './TextChannel';

export class Message extends DMessage {
	public commandFlags: string[];
	public channel!: TextChannel;
	public eventEmittedAt?: number;
	public arguments: { _: any[]; [key: string]: any } = { _: [] };
	public args: string[] = [];

	public constructor(client: Client, data: object, channel: TextChannel) {
		super(client, data, channel);
		this.commandFlags = [];
	}

	public get reactable(): boolean {
		// @ts-ignore
		if (this.channel.type === 'dm' || !this.guild) return true;
		return this.channel.permissionsFor(this.guild!.me!)!.has('ADD_REACTIONS');
	}

	public error(description: string, footer?: string): Promise<this> {
		const embed = new MessageEmbed();
		if (description) embed.setDescription(description);
		if (footer) embed.setFooter(footer);
		embed.setColor('9D344B');
		return this.channel.send(embed) as Promise<this>;
	}

	public success(description: string, footer?: string): Promise<this> {
		const embed = new MessageEmbed();
		if (description) embed.setDescription(description);
		if (footer) embed.setFooter(footer);
		embed.setColor('549431');
		return this.channel.send(embed) as Promise<this>;
	}

	public warn(description: string, footer?: string): Promise<this> {
		const embed = new MessageEmbed();
		if (description) embed.setDescription(description);
		if (footer) embed.setFooter(footer);
		embed.setColor('AA6039');
		return this.channel.send(embed) as Promise<this>;
	}

	public neutral(description: string, footer?: string): Promise<this> {
		const embed = new MessageEmbed();
		if (description) embed.setDescription(description);
		if (footer) embed.setFooter(footer);
		embed.setColor('257059');
		return this.channel.send(embed) as Promise<this>;
	}
}

Structures.extend('Message', (): any => Message);
