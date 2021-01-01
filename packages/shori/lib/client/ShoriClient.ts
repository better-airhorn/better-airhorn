import { Client, ClientOptions } from 'discord.js';
import { EventEmitter } from 'events';
import { isNullOrUndefined } from 'util';
import { EventOptions, ShoriOptions } from '..';
import { ReflectKeys } from '../enums/ReflectKeys';
import { clientInjectedSubject } from '../Lists/ClientList';
import '../struct/DiscordExtends/Message';
import '../struct/DiscordExtends/TextChannel';
import { OnInit } from '../struct/LifeCycleHooks/LifeCycleHooks';
import { MessageHandler } from '../struct/MessageHandler';
import { resolveSingleton } from '../struct/util/Util';

export abstract class ShoriClient extends Client {
	public readonly prefix: string;
	public readonly ownerIds: string[] = [];
	private readonly allServicesInitiated: undefined | (() => Promise<void[]>);
	private readonly isDev: boolean;
	public constructor(shoriOptions: ShoriOptions, clientOptions?: ClientOptions) {
		super(clientOptions);
		this.isDev = shoriOptions.isDev ?? false;
		if (shoriOptions.ownerIds) this.ownerIds = shoriOptions.ownerIds;
		this.prefix = shoriOptions.prefix;
		clientInjectedSubject.asObservable().subscribe(value => {
			Object.defineProperty(value.target, value.prop, { get: () => this });
		});

		shoriOptions.services = shoriOptions.services ?? [];
		shoriOptions.services.unshift(MessageHandler);
		if (shoriOptions.services) {
			this.allServicesInitiated = () => {
				return Promise.all(
					shoriOptions.services!.map(async service => {
						const instance: OnInit = resolveSingleton(service);
						if (typeof instance.shOnInit === 'function') {
							this.emit('debug', `[ShoriClient] running ${service.name}'s init`);
							await instance.shOnInit();
							this.emit('debug', `[ShoriClient] ${service.name} finished initializing`);
						}
						const events: EventOptions[] = Reflect.getMetadata(ReflectKeys.EVENT, service) || [];
						events.map(element => {
							if (element.source instanceof EventEmitter || isNullOrUndefined(element.source)) {
								(element.source || this)[element.once ? 'once' : 'on'](element.event, element.method.bind(instance));
							}
						});
					}),
				);
			};
			this.once('ready', () => {
				shoriOptions.services!.forEach(service => {
					const instance: { shOnReady?: () => any } = resolveSingleton(service);
					if (typeof instance.shOnReady === 'function') {
						instance.shOnReady();
					}
				});
			});
		}
	}

	public start(token: string): Promise<string | void> {
		return this.allServicesInitiated!()
			.then(() => this.login(token))
			.catch(e => {
				if (this.isDev) {
					this.emit(
						'debug',
						`[ShoriClient] Skipping failed initiation of Service, disable dev mode to prevent this\n ${e}`,
					);
					return this.login(token);
				}
				throw e;
			});
	}

	/**
	 *Must be implemented by the Client.
	 *This is used to get the prefix for a Guild/DM
	 *If this rejects, the default prefix will be used
	 *If this resolves with undefined, the default prefix will be used
	 *
	 * @abstract
	 * @param {string} id
	 * @returns {Promise<string>}
	 * @memberof ShoriClient
	 */
	public abstract getPrefix(id: string): Promise<string | undefined>;
}
