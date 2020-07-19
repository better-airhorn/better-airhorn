import { ReflectKeys } from '../../enums/ReflectKeys';
import { addCommand } from '../../Lists/CommandsList';
import { CommandBase, CommandOptions } from '../CommandBase';
import { resolveSingleton } from '../util/Util';

export function Command(name: string, options?: CommandOptions) {
	return function decorator(constructor_: any): void {
		const instance = resolveSingleton<CommandBase>(constructor_);
		instance.guards.push(...(Reflect.getMetadata(ReflectKeys.GUARD, constructor_) || []));
		instance.configure({ ...options, name });
		addCommand({ class: instance, name });
	};
}
