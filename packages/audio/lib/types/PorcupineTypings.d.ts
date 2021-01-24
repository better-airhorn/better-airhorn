// <reference types="node" />

// Typings for @picovoice/porcupine-node

declare module '@picovoice/porcupine-node' {
	export default class Porcupine {
		protected handle: any;
		public frameLength: number;
		public sampleRate: number;
		public constructor(
			keywords: number[],
			sensitivities: number[],
			manualModelPath?: string,
			manualLibraryPath?: string,
		);

		public process(frame: number[]): number;
		public release(): void;
	}
}

declare module '@picovoice/porcupine-node/builtin_keywords' {
	export const ALEXA: number;
	export const AMERICANO: number;
	export const BLUEBERRY: number;
	export const BUMBLEBEE: number;
	export const COMPUTER: number;
	export const GRAPEFRUIT: number;
	export const GRASSHOPPER: number;
	export const HEY_GOOGLE: number;
	export const HEY_SIRI: number;
	export const JARVIS: number;
	export const OK_GOOGLE: number;
	export const PICOVOICE: number;
	export const PORCUPINE: number;
	export const TERMINATOR: number;
	export const BUILTIN_KEYWORDS_ENUMS: Set<number>;
	export const BUILTIN_KEYWORDS_STRINGS: Set<string>;
	export const BUILTIN_KEYWORDS_ENUM_TO_STRING: Map<number, string>;
	export const BUILTIN_KEYWORDS_STRING_TO_ENUM: Map<string, number>;
	export function getBuiltinKeywordPath(buildInKeywords: number | string): string;
}

declare module '@picovoice/porcupine-node/errors' {
	export class PvArgumentError extends Error {}
	export class PvStateError extends Error {}
	export class PvUnsupportedPlatformError extends Error {}

	export class PvStatusOutOfMemoryError extends Error {}
	export class PvStatusIoError extends Error {}
	export class PvStatusInvalidArgumentError extends Error {}
	export class PvStatusStopIterationError extends Error {}
	export class PvStatusKeyError extends Error {}
	export class PvStatusInvalidStateError extends Error {}

	export function pvStatusToException(pvStatusInt: number, errorMessage: string): void;
}
