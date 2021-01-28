import { strictEqual } from 'assert';
import { spawn } from 'child_process';
import { createReadStream, createWriteStream, mkdirSync, rmdirSync, statSync, unlinkSync } from 'fs';
import 'mocha';
import { join } from 'path';
import { pipeline } from 'stream';
import { convertToOGG } from '../dist/index';
const outputDir = join(__dirname, './output');
const outputFile = join(outputDir, 'out.ogg');

try {
	unlinkSync(outputFile);
} catch {}
try {
	rmdirSync(outputDir, { recursive: true });
} catch {}
mkdirSync(outputDir);

const files: Map<string, { path: string; length: number; size: number }> = new Map()
	.set('aac', { path: join(__dirname, './testfiles/sample.aac'), length: 18_7000, size: 173000 })
	.set('ac3', { path: join(__dirname, './testfiles/sample.ac3'), length: 18_7000, size: 173000 })
	.set('flac', { path: join(__dirname, './testfiles/sample.flac'), length: 18_7000, size: 173000 })
	.set('mp3', { path: join(__dirname, './testfiles/sample.mp3'), length: 18_7000, size: 173000 })
	.set('ogg', { path: join(__dirname, './testfiles/sample.ogg'), length: 18_7000, size: 173000 })
	.set('opus', { path: join(__dirname, './testfiles/sample.opus'), length: 18_7000, size: 173000 })
	.set('wav', { path: join(__dirname, './testfiles/sample.wav'), length: 18_7000, size: 173000 })
	.set('wma', { path: join(__dirname, './testfiles/sample.wma'), length: 18_7000, size: 173000 })
	.set('invalid', { path: join(__dirname, './testfiles/invalid.mp3') });

describe('Audio Conversion', () => {
	beforeEach(() => {
		try {
			unlinkSync(outputFile);
		} catch {}
	});

	convertToOGG.supportedFormats.forEach(format => {
		it(`should be able to convert ${format}`, async function test() {
			this.timeout(10000);
			return testFile(files.get(format)!);
		});
	});

	it(`should throw error on invalid stream`, async function test() {
		this.timeout(10000);
		const file = files.get('invalid')!;
		return strictEqual(
			await convertToOGG(createReadStream(file.path)).catch(() => 'rejected'),
			'rejected',
			'did not reject on invalid data',
		);
	});
});

function validateFile(input: string): Promise<void | string> {
	return new Promise((res, rej) => {
		const child = spawn('ffmpeg', ['-v', 'error', '-i', input, '-f', 'null', '-']);
		child.once('error', rej);
		let wroteData = false;
		let writtenData: string;
		child.stderr.on('data', (b: Buffer) => {
			wroteData = true;
			writtenData = b.toString();
		});
		child.once('exit', () => (wroteData ? rej(writtenData) : res()));
	});
}

async function testFile(file: { path: string; length: number; size: number }) {
	const result = await convertToOGG(createReadStream(file.path)).then(async v => {
		await new Promise((res, rej) =>
			pipeline(v.stream, createWriteStream(outputFile), err => {
				if (err) rej(err);
			}).once('finish', res),
		);
		return v;
	});

	const size = statSync(outputFile).size;
	strictEqual(
		Math.abs(size - file.size) < 100_000,
		true,
		`file size differs too much. Difference: ${Math.abs(size - file.size)}`,
	);
	strictEqual(await validateFile(outputFile), undefined, 'output file is invalid');
	strictEqual(
		Math.abs((await result.duration) - file.length) < 50,
		true,
		`audio length differs too much. Difference: ${Math.abs((await result.duration) - file.length)}`,
	);
}
