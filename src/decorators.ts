import { getContainer } from './instance';
import { InjectableClass, InjectableOptions } from './types';

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
    return (target) => {
        const container = getContainer();
        container.register(target as unknown as InjectableClass, options);
    };
}
