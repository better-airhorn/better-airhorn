import { PermissionString } from 'discord.js';
import { ShoriClient } from '../client/ShoriClient';
import { Message } from './DiscordExtends/Message';
import { BaseGuard } from './Guards/BaseGuard';

export abstract class CommandBase {
	public client: ShoriClient;
	public guards: BaseGuard[] = [];

	//* ~~~~~~~~~~~~ Miscellaneous ~~~~~~~~~~~~ //
	public name: string;
	public category: string;
	public example?: string;
	public description: string;

	public parseArguments: boolean;
	public showInHelp?: boolean;

	//* ~~~~~~~~~~~~~ Permissions ~~~~~~~~~~~~~ //
	public userPermissions: PermissionString[];
	public userChannelPermissions: PermissionString[];
	public botPermissions: PermissionString[];
	public botChannelPermissions: PermissionString[];

	//* ~~~~~~~~~~~~~ Requirements ~~~~~~~~~~~~ //
	public onlyOwner: boolean;
	public voteLock: boolean;
	public channel: CommandOptions['channel'];

	/**
	 *Will be called whenever a command gets executed
	 *
	 * @abstract
	 * @param {ShoriClient} client
	 * @param {BMessage} message
	 * @param {string[]} args
	 * @returns {Promise<any>}
	 * @memberof Command
	 */
	public abstract async exec(message: Message, args: string[]): Promise<any>;

	public configure(options?: CommandOptions): void {
		this.name = options?.name || 'not set';
		this.category = options?.category || 'misc';
		this.example = options?.example || 'none';
		this.description = options?.description || 'none';
		this.voteLock = options?.voteLock || false;
		this.onlyOwner = options?.onlyOwner || false;
		this.channel = options?.channel || 'any';

		this.userPermissions = options?.userPermissions || [];
		this.userChannelPermissions = options?.userChannelPermissions || [];
		this.botPermissions = options?.botPermissions || [];
		this.botChannelPermissions = options?.botChannelPermissions || [];
		this.parseArguments = options.parseArguments ?? false;
		this.showInHelp = options.showInHelp ?? true;
	}
}

export interface CommandOptions {
	name?: string;
	category?: string;
	example?: string;
	description?: string;
	parseArguments?: boolean;
	showInHelp?: boolean;

	onlyOwner?: boolean;
	voteLock?: boolean;
	channel?: 'dm' | 'guild' | 'any';

	userPermissions?: PermissionString[];
	userChannelPermissions?: PermissionString[];
	botPermissions?: PermissionString[];
	botChannelPermissions?: PermissionString[];
}
