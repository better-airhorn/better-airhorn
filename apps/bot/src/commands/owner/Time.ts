import { GuildSetting } from '@better-airhorn/entities';
import { Command, CommandBase, commandMap, Message, MessageHandler, UseGuard } from '@better-airhorn/shori';
import { container } from 'tsyringe';
import { ArgsGuard } from '../../guards/ArgsGuard';

@Command('time', {
	channel: 'any',
	category: 'owner',
	example: 'time play',
	description: 'measures execution time for a command',
	onlyOwner: true,
	showInHelp: false,
})
export class TimeCommand extends CommandBase {
	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const cmd = commandMap.get(args.shift()!);
		if (!cmd) {
			return message.error('command not found');
		}
		const handler = container.resolve(MessageHandler);
		const settings = await GuildSetting.findOne(message.guild!.id);
		message.content = `${settings!.prefix} ${cmd.name} ${args.join(' ')}`;
		let hrDiff = process.hrtime();
		await handler.onMessage(message);
		hrDiff = process.hrtime(hrDiff);
		return message.neutral(
			`took ${hrDiff[0] > 0 ? `${hrDiff[0].toFixed(2)}s ` : ''}${(hrDiff[1] / 1000000).toFixed(2)} ms to execute`,
		);
	}
}
