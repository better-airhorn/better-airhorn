// ! DO NOT EDIT MANUALLY
// this is auto-generated. see the Localization folder on the root level
export interface ILocalization {
	commands: Commands;
}
export interface Commands {
	config: Config;
	prefix: Prefix;
	ping: Ping;
	stats: Stats;
	invite: string;
	list: List;
	delete: Delete;
	import: Import;
	like: Like;
	play: Play;
	random: Random;
	soundinfo: string;
	generalKeys: GeneralKeys;
}
export interface Config {
	availableConfigurations: string;
	availableConfigurationsList: AvailableConfigurationsList;
	pleaseUseTrueOrFalse: string;
	updatedSettings: string;
	optionIsCurrentlyEnabled: string;
	optionIsCurrentlyDisabled: string;
}
export interface AvailableConfigurationsList {
	leaveAfterPlay: LeaveAfterPlayOrSendMessageAfterPlay;
	sendMessageAfterPlay: LeaveAfterPlayOrSendMessageAfterPlay;
}
export interface LeaveAfterPlayOrSendMessageAfterPlay {
	name: string;
	description: string;
}
export interface Prefix {
	currentPrefixIs: string;
	provideArgumentToSetPrefix: string;
	prefixTooShort: string;
	prefixTooLong: string;
	changedPrefix: string;
	newPrefixIs: string;
}
export interface Ping {
	generalPingInformation: string;
}
export interface Stats {
	embeds: Embeds;
}
export interface Embeds {
	field1: Field1OrField2OrField3;
	field2: Field1OrField2OrField3;
	field3: Field1OrField2OrField3;
}
export interface Field1OrField2OrField3 {
	title: string;
	description: string;
}
export interface List {
	pageFooter: string;
}
export interface Delete {
	successfullyDeleted: string;
	missingPermissions: string;
	useForce: string;
}
export interface Import {
	failedToLocateAudio: string;
	audioTooBig: string;
	wasntAbleToGetSizeOrLength: string;
	pleaseWaitDownloading: string;
	savedSoundAs: string;
}
export interface Like {
	soundLike: string;
}
export interface Play {
	jobIsTakingLongToStart: string;
	finishedPlaying: string;
}
export interface Random {
	finishedPlaying: string;
}
export interface GeneralKeys {
	soundNotFound: string;
	suggestPredictedName: string;
	playPredictedName: string;
	needToBeInVoiceChannel: string;
	unexpectedError: string;
	somethingDidntGoRight: string;
}

export type Languages = 'en-US';
export type LocalizationKeys =
	| 'commands.config.availableConfigurations'
	| 'commands.config.availableConfigurationsList.leaveAfterPlay.name'
	| 'commands.config.availableConfigurationsList.leaveAfterPlay.description'
	| 'commands.config.availableConfigurationsList.sendMessageAfterPlay.name'
	| 'commands.config.availableConfigurationsList.sendMessageAfterPlay.description'
	| 'commands.config.pleaseUseTrueOrFalse'
	| 'commands.config.updatedSettings'
	| 'commands.config.optionIsCurrentlyEnabled'
	| 'commands.config.optionIsCurrentlyDisabled'
	| 'commands.prefix.currentPrefixIs'
	| 'commands.prefix.provideArgumentToSetPrefix'
	| 'commands.prefix.prefixTooShort'
	| 'commands.prefix.prefixTooLong'
	| 'commands.prefix.changedPrefix'
	| 'commands.prefix.newPrefixIs'
	| 'commands.ping.generalPingInformation'
	| 'commands.stats.embeds.field1.title'
	| 'commands.stats.embeds.field1.description'
	| 'commands.stats.embeds.field2.title'
	| 'commands.stats.embeds.field2.description'
	| 'commands.stats.embeds.field3.title'
	| 'commands.stats.embeds.field3.description'
	| 'commands.invite'
	| 'commands.list.pageFooter'
	| 'commands.delete.successfullyDeleted'
	| 'commands.delete.missingPermissions'
	| 'commands.delete.useForce'
	| 'commands.import.failedToLocateAudio'
	| 'commands.import.audioTooBig'
	| 'commands.import.wasntAbleToGetSizeOrLength'
	| 'commands.import.pleaseWaitDownloading'
	| 'commands.import.savedSoundAs'
	| 'commands.like.soundLike'
	| 'commands.play.jobIsTakingLongToStart'
	| 'commands.play.finishedPlaying'
	| 'commands.random.finishedPlaying'
	| 'commands.soundinfo'
	| 'commands.generalKeys.soundNotFound'
	| 'commands.generalKeys.suggestPredictedName'
	| 'commands.generalKeys.playPredictedName'
	| 'commands.generalKeys.needToBeInVoiceChannel'
	| 'commands.generalKeys.unexpectedError'
	| 'commands.generalKeys.somethingDidntGoRight';
