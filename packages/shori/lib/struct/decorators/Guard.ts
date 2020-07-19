import { ReflectKeys } from '../../enums/ReflectKeys';
import { BaseGuard } from '../Guards/BaseGuard';
export interface InstantiableGuard {
	new (): BaseGuard;
}

export function UseGuard(guard: InstantiableGuard | BaseGuard) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	return function decorator(target: any, _propertyKey: string): void {
		const guards: BaseGuard[] = Reflect.getMetadata(ReflectKeys.GUARD, target.constructor) || [];
		if (guard instanceof BaseGuard) {
			guards.push(guard);
		} else {
			guards.push(new guard());
		}
		Reflect.defineMetadata(ReflectKeys.GUARD, guards, target.constructor);
	};
}
