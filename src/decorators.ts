import 'reflect-metadata';
import { getContainer } from './instance';
import { markParameterOptional, setParameterInjection, setPropertyInjection } from './metadata';
import { InjectableClass, InjectableOptions, ResolveToken } from './types';

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
    return (target) => {
        const container = getContainer();
        container.register(target as unknown as InjectableClass, options);
    };
}

export function Inject(token: ResolveToken): ParameterDecorator & PropertyDecorator {
    const decorator = (...args: unknown[]) => {
        if (typeof args[2] === 'number') {
            const [target, key, index] = args as [object, string | symbol | undefined, number];
            if (key !== undefined) {
                throw new Error('@Inject cannot be used on method parameters.');
            }
            setParameterInjection(target as unknown as InjectableClass, index, token);
            return;
        }

        if (typeof args[1] === 'undefined' || typeof args[1] === 'number') {
            throw new Error(
                '@Inject usage invalid. Use on constructor parameters or class properties.'
            );
        }

        const [target, propertyKey] = args as [object, string | symbol];
        setPropertyInjection(target.constructor as InjectableClass, propertyKey, token);
    };

    return decorator as ParameterDecorator & PropertyDecorator;
}

export function Optional(): ParameterDecorator {
    return (target, propertyKey, parameterIndex) => {
        if (typeof parameterIndex !== 'number' || propertyKey !== undefined) {
            throw new Error('@Optional can only be used on constructor parameters.');
        }
        markParameterOptional(target as unknown as InjectableClass, parameterIndex);
    };
}
