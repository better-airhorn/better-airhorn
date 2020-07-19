/* eslint-disable @typescript-eslint/ban-types */
import { constructor } from 'tsyringe/dist/typings/types';
import { CommandData } from '../struct/options/CommandData';
import { EventListenerData } from '../struct/options/EventListenerData';

export enum EventType {
	EVENT,
	COMMAND,
}

export interface AddInstancePayload {
	type: EventType;
	target: constructor<any>;
	data?: CommandData | EventListenerData;
}

export interface AddInstanceEventPayload extends AddInstancePayload {
	instance: any;
}
