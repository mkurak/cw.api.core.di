import 'reflect-metadata';
import { getContainer } from './instance';
import {
    appendActionMiddlewares,
    ensureMiddlewareContract,
    markParameterOptional,
    setMiddlewareMetadata,
    setParameterInjection,
    setPropertyInjection
} from './metadata';
import { InjectableClass, InjectableOptions, Lifecycle, ResolveToken, ServiceType } from './types';

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
    return (target) => {
        const container = getContainer();
        const type = options.type ?? ServiceType.Service;

        if (type === ServiceType.Action && options.middlewares) {
            appendActionMiddlewares(target as unknown as InjectableClass, options.middlewares);
        }

        if (type === ServiceType.Middleware) {
            ensureMiddlewareContract(target as unknown as InjectableClass);
            if (!options.lifecycle) {
                options.lifecycle = Lifecycle.Transient;
            }
        }

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

interface MiddlewareDecoratorOptions extends InjectableOptions {
    order?: number;
}

function createMiddlewareDecorator(scope: 'route' | 'global') {
    return (options: MiddlewareDecoratorOptions = {}): ClassDecorator => {
        const { order = 0, middlewares: _ignored, ...rest } = options;
        void _ignored;
        const base = Injectable({
            ...rest,
            type: ServiceType.Middleware,
            lifecycle: rest.lifecycle ?? Lifecycle.Transient
        });

        return (target) => {
            base(target);
            setMiddlewareMetadata(target as unknown as InjectableClass, { scope, order });
        };
    };
}

export const RouteMiddleware = createMiddlewareDecorator('route');
export const GlobalMiddleware = createMiddlewareDecorator('global');

export function UseMiddleware(...tokens: ResolveToken[]): ClassDecorator {
    return (target) => {
        appendActionMiddlewares(target as unknown as InjectableClass, tokens);
    };
}
