import { SyncCommand } from './admin/Sync';
import { ConfigCommand } from './config/Config';
import { InviteCommand } from './misc/Invite';
import { ClearCommand } from './music/Clear';
import { DeleteCommand } from './music/Delete';
import { LeaveCommand } from './music/Leave';
import { PlayCommand } from './music/Play';
import { SkipCommand } from './music/Skip';

export const commands = [
	PlayCommand,
	ConfigCommand,
	SyncCommand,
	SkipCommand,
	ClearCommand,
	InviteCommand,
	DeleteCommand,
	LeaveCommand,
];
