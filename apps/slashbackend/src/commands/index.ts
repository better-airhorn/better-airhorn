import { InviteCommand, SyncCommand } from './misc';
import { BlockCommand, ConfigCommand, UnblockCommand } from './config';
import { QuizCommand } from './quiz';
import { EntranceCommand, ExportCommand, PanelCommand } from './server';
import { DeleteCommand, InfoCommand, ListCommand, PlayCommand, RandomCommand, ShareCommand } from './sounds';
import { SaveAsSoundCommand, UploadCommand } from './upload';
import { ClearCommand, LeaveCommand, SkipCommand } from './voice';
import { WrappedCommand } from './wrapped';

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
	QuizCommand,
	WrappedCommand,
	ConfigCommand,
	BlockCommand,
	UnblockCommand,
	EntranceCommand,
	PanelCommand,
	ExportCommand,
	InviteCommand,
	SyncCommand,
];
