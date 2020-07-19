import { EventEmitter } from 'events';

export interface EventListenerData {
	event: string;
	method: Function;
	once: boolean;
	source: EventEmitter | string;
}
