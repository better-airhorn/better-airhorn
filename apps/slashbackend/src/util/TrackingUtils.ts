import { Usage } from '@better-airhorn/entities';
import { SlashCreator } from 'slash-create';
import { container } from 'tsyringe';

// this file is for tracking command usages, nothing crazy

export async function initTracking() {
	const creator = container.resolve(SlashCreator);

	creator.on('commandRun', async (cmd, returnPromise, ctx) => {
		const usageEntity = Usage.create({
			command: cmd.commandName,
			user: ctx.user.id,
			guild: ctx.guildID,
			args: JSON.stringify(ctx.options),
		});
		await usageEntity.save();
	});
}
