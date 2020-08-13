import { BaseGuard, CommandBase, Message } from '@better-airhorn/shori';

export class ArgsGuard extends BaseGuard {
	protected argsCount = 1;
	public constructor(minimumArgsCount: number) {
		super();
		this.argsCount = minimumArgsCount;
	}

	public async canActivate(message: Message, cmd: CommandBase, args: string[]): Promise<boolean> {
		if (args.length < this.argsCount) {
			await message.error(
				`This command requires at least ${this.argsCount} arguments, you only provided ${args.length}`,
				cmd.example ? `example: ${cmd.example}` : undefined,
			);
			return false;
		}
		return true;
	}
}
