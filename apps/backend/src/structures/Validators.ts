import { registerDecorator } from 'class-validator';

export function IsNotBlank() {
	// eslint-disable-next-line func-names
	return function(object: Record<string, any>, propertyName: string) {
		registerDecorator({
			name: 'isNotBlank',
			target: object.constructor,
			propertyName: propertyName,
			options: { message: 'prefix can not be blank' },
			validator: {
				validate(value: any) {
					return typeof value === 'string' && value.trim().length > 0;
				},
			},
		});
	};
}
