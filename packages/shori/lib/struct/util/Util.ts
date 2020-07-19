import { container, singleton } from 'tsyringe';

export function resolveSingleton<T>(constructor: any): T {
	if (!container.isRegistered(constructor)) singleton()(constructor);
	return container.resolve(constructor);
}
