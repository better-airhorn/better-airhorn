import { Structures, TextChannel as DTextChannel } from 'discord.js';

export class TextChannel extends DTextChannel {
	public get sendable(): boolean {
		return this.permissionsFor(this.guild!.me!)!.has('SEND_MESSAGES');
	}
}

Structures.extend('TextChannel', (): any => TextChannel);
