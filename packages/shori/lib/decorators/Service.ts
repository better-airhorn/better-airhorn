import { injectable, singleton } from 'tsyringe';

export function Service(options: { singleton: boolean } = { singleton: true }) {
	return function decorator(constructor_: any): void {
		if (options.singleton) {
			singleton()(constructor_);
		} else {
			injectable()(constructor_);
		}
	};
}
