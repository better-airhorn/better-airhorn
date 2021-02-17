import { OnInit, Service } from '@better-airhorn/shori';
import { promises } from 'fs';
import { join } from 'path';
import { Config } from '../config/Config';
import { ILocalization, Languages, LocalizationKeys } from '../models/ILocalization';
import { logger } from '../utils/Logger';

const placeHolderRegex = /\{([\w|.]+)\}/g;

/**
 * This Service provides methods for localization
 *
 * @class LocalizationService
 */
@Service()
export class LocalizationService implements OnInit {
	private readonly languages: { [key: string]: ILocalization } = {};
	private readonly defaultLanguage = Config.localization.defaultLanguage;

	public async shOnInit() {
		const files = await promises.readdir(Config.localization.files);
		const entries = files.map(file => ({
			language: file.split('.json')[0],
			path: join(Config.localization.files, file),
		}));
		if (!entries.find(v => v.language === Config.localization.defaultLanguage)) {
			throw new Error(`unable to find default language\navailable languages: ${entries.map(v => v.language)}`);
		}
		for (const iterator of entries) {
			try {
				const data = await promises.readFile(iterator.path);
				this.languages[iterator.language] = JSON.parse(data.toString());
			} catch (e) {
				if (iterator.language === this.defaultLanguage) {
					logger.error(`unable to load language\n${e.message}`);
					throw new Error(`unable to load default language\n${e.message}`);
				}
				logger.error(`unable to load language\n${e.message}`);
			}
		}
	}

	public t(language?: Languages) {
		return this.languages[language || this.defaultLanguage];
	}

	public format(
		key: LocalizationKeys,
		languageOrArguments: Languages | { [key: string]: string | number },
		args?: { [key: string]: string },
	) {
		if (typeof languageOrArguments === 'object' && Boolean(args))
			throw Error('you cant supply languageOrArguments and args');

		const realArguments = typeof languageOrArguments === 'object' ? languageOrArguments : args || {};
		function index(obj: any, i: string) {
			return obj[i];
		}
		let value: string = key
			.split('.')
			.reduce(index, this.t(typeof languageOrArguments === 'string' ? languageOrArguments : undefined));

		// @ts-ignore shut up ts, string.matchAll is a thing
		const allMatches = value.matchAll(placeHolderRegex);
		for (const match of allMatches) {
			const valueToPlace = realArguments[match[1]];
			if (valueToPlace === undefined) continue;
			value = value.replace(match[0], valueToPlace.toString());
		}
		return value;
	}
}
