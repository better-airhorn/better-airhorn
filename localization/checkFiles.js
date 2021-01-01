const { execSync, spawnSync, exec } = require('child_process');
const { readdirSync, readFileSync, copyFileSync, unlinkSync, appendFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const dot = require('dot-object');

const folderPath = join(__dirname, './files');
let firstFile;
const files = readdirSync(folderPath);
for (const file of files) {
	const content = JSON.parse(readFileSync(join(folderPath, file)).toString());
	if (!firstFile) {
		firstFile = content;
	}
	// this code slower than yo mom
	const missingKeys = Object.keys(content).filter(k => !Object.keys(firstFile).includes(k));
	if (missingKeys.length > 0) {
		throw new Error(`something seems off here ${missingKeys}`);
	}
}

execSync('npm run prv_generateInterface');
const file = join(__dirname, './ILocalization.ts');
const tgt = Object.keys(dot.dot(firstFile)).map(v => `'${v}'`);
// kind of ineffective but who cares
const lines = readFileSync(file)
	.toString()
	.split('\n');
lines.unshift('// this is auto-generated. see the Localization folder on the root level');
lines.unshift('// ! DO NOT EDIT MANUALLY');
writeFileSync(file, lines.join('\n'));
appendFileSync(file, `\n export type Languages = ${files.map(v => `'${v.split('.json')[0]}'`).join('|')};`);
appendFileSync(file, `\n export type LocalizationKeys = ${tgt.join('|')};`);
copyFileSync(file, join(__dirname, '../apps/bot/src/models/ILocalization.ts'));
unlinkSync(file);
execSync('npm run lint:fix', { cwd: join(__dirname, '../') });
