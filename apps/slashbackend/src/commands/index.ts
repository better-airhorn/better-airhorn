import { InviteCommand, SyncCommand } from './misc';
import { ConfigCommand, EntranceCommand, ExportCommand, PanelCommand } from './server';
import { DeleteCommand, InfoCommand, ListCommand, PlayCommand, RandomCommand, ShareCommand } from './sounds';
import { SaveAsSoundCommand, UploadCommand } from './upload';
import { ClearCommand, LeaveCommand, SkipCommand } from './voice';

export const commands = [
	PlayCommand,
	RandomCommand,
	UploadCommand,
	SaveAsSoundCommand,
	ListCommand,
	InfoCommand,
	DeleteCommand,
	ShareCommand,
	SkipCommand,
	ClearCommand,
	LeaveCommand,
	ConfigCommand,
	EntranceCommand,
	PanelCommand,
	ExportCommand,
	InviteCommand,
	SyncCommand,
];
