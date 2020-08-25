import { ConfigCommand } from './config/Config';
import { PrefixCommand } from './config/Prefix';
import { HelpCommand } from './info/Help';
import { PingCommand } from './info/Ping';
import { StatsCommand } from './info/Stats';
import { StatusCommand } from './info/Status';
import { InviteCommand } from './misc/Invite';
import { DeleteCommand } from './music/Delete';
import { ImportCommand } from './music/Import';
import { LikeCommand } from './music/Like';
import { ListCommand } from './music/List';
import { PlayCommand } from './music/Play';
import { RandomCommand } from './music/Random';
import { ECommand } from './owner/E';
import { ExecCommand } from './owner/Exec';
import { TimeCommand } from './owner/Time';

[
	PingCommand,
	PrefixCommand,
	PingCommand,
	HelpCommand,
	StatsCommand,
	ListCommand,
	PlayCommand,
	ECommand,
	ExecCommand,
	TimeCommand,
	LikeCommand,
	InviteCommand,
	StatusCommand,
	DeleteCommand,
	ConfigCommand,
	ImportCommand,
	RandomCommand,
];
