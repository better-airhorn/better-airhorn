import { isObservable } from 'rxjs';
import { BaseArgumentManipulator } from '../ArgumentManipulator/BaseArgumentManipulator';
import { CommandBase } from '../CommandBase';
import { Message } from '../DiscordExtends/Message';

export interface InstantiableArgumentManipulator {
	new (): BaseArgumentManipulator;
}

export function ManipulateArguments(manipulator: InstantiableArgumentManipulator | BaseArgumentManipulator) {
	return function descriptor(target: any, propertyKey: string, descriptor: PropertyDescriptor): any {
		const instance = manipulator instanceof BaseArgumentManipulator ? manipulator : new manipulator();
		const originalFunction: Function = target[propertyKey];

		descriptor.value = async function value(message: Message, args: string[]): Promise<any> {
			const returnValue = instance.beforeExec(message, args, this as CommandBase);
			const newArguments = await (isObservable(returnValue) ? returnValue.toPromise() : returnValue);
			return originalFunction.apply(this, newArguments);
		};
	};
}
