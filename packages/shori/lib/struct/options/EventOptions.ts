import { EventEmitter } from 'events';

export interface EventOptions {
	event: string;
	source: EventEmitter | string;
	once: boolean;
	method: Function;
}
