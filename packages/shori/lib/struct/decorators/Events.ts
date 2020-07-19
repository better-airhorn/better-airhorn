import { ReflectKeys } from '../../enums/ReflectKeys';
import { EventOptions } from '../options/EventOptions';

export function Event(event: string, options?: Omit<EventOptions, 'event' | 'method'>) {
	return function decorator(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
		const accurateOptions: EventOptions = {
			...(options || { once: false, source: null }),
			event,
			method: descriptor.value,
		};
		const events: EventOptions[] = Reflect.getMetadata(ReflectKeys.EVENT, target.constructor) || [];
		events.push(accurateOptions);
		Reflect.defineMetadata(ReflectKeys.EVENT, events, target.constructor);
	};
}
