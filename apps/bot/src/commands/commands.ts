import { ConfigCommand } from './config/Config';
import { PrefixCommand } from './config/Prefix';
import { PingCommand } from './info/Ping';
import { StatsCommand } from './info/Stats';
import { StatusCommand } from './info/Status';
import { HelpCommand } from './misc/Help';
import { InviteCommand } from './misc/Invite';
import { DeleteCommand } from './music/Delete';
import { LikeCommand } from './music/Like';
import { ListCommand } from './music/List';
import { PlayCommand } from './music/Play';
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
];
