import { TextChannel } from '@better-airhorn/shori';
import { CollectorFilter } from 'discord.js';

export async function promptMessage(channel: TextChannel, filter: CollectorFilter, time = 120000): Promise<string> {
	const collected = await channel.awaitMessages(filter, { time, errors: ['time'], max: 1 });
	return collected.first().content;
}
