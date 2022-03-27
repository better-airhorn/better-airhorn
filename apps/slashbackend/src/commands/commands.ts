import { SyncCommand } from './admin/Sync';
import { ConfigCommand } from './config/Config';
import { InviteCommand } from './misc/Invite';
import { ClearCommand } from './music/Clear';
import { DeleteCommand } from './music/Delete';
import { InfoCommand } from './music/Info';
import { LeaveCommand } from './music/Leave';
import { PlayCommand } from './music/Play';
import { SkipCommand } from './music/Skip';
import { UploadCommand } from './music/Upload';

export const commands = [
	PlayCommand,
	ConfigCommand,
	SyncCommand,
	SkipCommand,
	ClearCommand,
	InviteCommand,
	DeleteCommand,
	LeaveCommand,
	UploadCommand,
	InfoCommand,
];
