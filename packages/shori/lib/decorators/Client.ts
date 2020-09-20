import { clientInjectedSubject } from '../Lists/ClientList';

export function Client(): (target: any, propertyKey: string | symbol) => any {
	return function decorator(target: any, propertyKey: string | symbol): any {
		clientInjectedSubject.next({ target, prop: propertyKey });
	};
}
