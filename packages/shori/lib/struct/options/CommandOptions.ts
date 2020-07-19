import { PermissionString } from 'discord.js';

export interface CommandOptions {
	name?: string;
	category?: string;
	example?: string;
	description?: string;

	onlyOwner?: boolean;
	voteLock?: boolean;
	channel?: 'dm' | 'guild' | 'any';
	parseArg?: boolean;

	userPermissions?: PermissionString[];
	userChannelPermissions?: PermissionString[];
	botPermissions?: PermissionString[];
	botChannelPermissions?: PermissionString[];
}
