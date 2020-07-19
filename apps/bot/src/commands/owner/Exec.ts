import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { exec } from 'child_process';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { TextUploadService } from '../../utils/TextUploadService';

@Command('exec', {
	channel: 'any',
	category: 'owner',
	example: 'exec pwd',
	description: 'executes shell commands',
	onlyOwner: true,
	showInHelp: false,
})
export class ExecCommand extends CommandBase {
	public constructor(private readonly uploader: TextUploadService) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const m = await message.channel.send('executing...');
		const code = args.join(' ');

		exec(
			code,
			async (error, stdout): Promise<any> => {
				const output = (error || stdout) as string;
				if (output.length > 1950) {
					const hastebin = `${this.uploader.base}/${await this.uploader.upload(output)}`;
					return m.edit(hastebin);
				}

				return m.edit(`\`\`\`asciidoc\n${output}\`\`\``);
			},
		);
	}
}
