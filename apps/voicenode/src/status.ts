/** custom status lines shown under the bot's name, rotated so members discover the newer commands */
const lines = [
	'New: /quiz, guess the sound with your friends',
	"New: /wrapped, your server's year in sounds",
	'New: pin a soundboard with /panel',
	'New: sounds for joining, leaving and going live with /entrance',
	'New: /export a sound to your server soundboard',
	'New: right-click a voice message to save it as a sound',
	'Upload your own sounds with /upload',
];

const wrappedLine = "Your server's year in sounds is ready: try /wrapped";

/** 1 December to 7 January, UTC */
export function isWrappedSeason(now: Date): boolean {
	return now.getUTCMonth() === 11 || (now.getUTCMonth() === 0 && now.getUTCDate() <= 7);
}

/** the rotation for `now`; in wrapped season the wrapped line comes first and every other line */
export function statusLines(now = new Date()): string[] {
	if (!isWrappedSeason(now)) return lines;
	return lines.filter(line => !line.includes('/wrapped')).flatMap(line => [wrappedLine, line]);
}
