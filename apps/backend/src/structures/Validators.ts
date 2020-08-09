import { registerDecorator } from 'class-validator';

export function IsNotBlank() {
	return (object: Record<string, any>, propertyName: string) => {
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
