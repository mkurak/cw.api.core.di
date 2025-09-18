import 'reflect-metadata';
import { getContainer } from './instance';
import { setParameterInjection } from './metadata';
import { InjectableClass, InjectableOptions, ResolveToken } from './types';

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
    return (target) => {
        const container = getContainer();
        container.register(target as unknown as InjectableClass, options);
    };
}

export function Inject(token: ResolveToken): ParameterDecorator {
    return (target, propertyKey, parameterIndex) => {
        if (typeof parameterIndex !== 'number' || propertyKey !== undefined) {
            throw new Error('@Inject can only be used on constructor parameters.');
        }
        setParameterInjection(target as unknown as InjectableClass, parameterIndex, token);
    };
}
