import { EventEmitter } from 'events';

export interface EventOptions {
	event: string;
	source: EventEmitter | string | null;
	once: boolean;
	method: Function;
}
