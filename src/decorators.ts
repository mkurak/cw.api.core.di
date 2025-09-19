import 'reflect-metadata';
import { getContainer } from './instance.js';
import {
    appendActionMiddlewares,
    ensureMiddlewareContract,
    markParameterOptional,
    markPropertyOptional,
    setControllerMetadata,
    setMiddlewareMetadata,
    setParameterInjection,
    setPropertyInjection,
    setActionRoute
} from './metadata.js';
import {
    InjectableClass,
    InjectableOptions,
    Lifecycle,
    ResolveToken,
    ServiceType,
    RouteMetadata,
    forwardRef
} from './types.js';

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
    return (target) => {
        const container = getContainer();
        const type = options.type ?? ServiceType.Service;

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

export function Optional(): ParameterDecorator & PropertyDecorator {
    return ((target: object, propertyKey?: string | symbol, parameterIndex?: number) => {
        if (typeof parameterIndex === 'number') {
            if (propertyKey !== undefined) {
                throw new Error('@Optional cannot be used on method parameters.');
            }
            markParameterOptional(target as unknown as InjectableClass, parameterIndex);
            return;
        }

        if (propertyKey !== undefined) {
            markPropertyOptional(
                (target as { constructor: InjectableClass }).constructor,
                propertyKey
            );
            return;
        }

        throw new Error('@Optional usage is invalid.');
    }) as ParameterDecorator & PropertyDecorator;
}

interface MiddlewareDecoratorOptions extends InjectableOptions {
    order?: number;
    phase?: 'before' | 'after';
}

interface ControllerOptions extends InjectableOptions {
    basePath: string;
    middlewares?: ResolveToken[];
    tags?: string[];
}

type RouteOptions = RouteMetadata;

function createMiddlewareDecorator(scope: 'route' | 'global') {
    return (options: MiddlewareDecoratorOptions = {}): ClassDecorator => {
        const { order = 0, phase, middlewares: _ignored, ...rest } = options;
        void _ignored;

        if (scope === 'global' && !phase) {
            throw new Error('Global middleware requires a phase ("before" or "after").');
        }

        const base = Injectable({
            ...rest,
            type: ServiceType.Middleware,
            lifecycle: rest.lifecycle ?? Lifecycle.Transient
        });

        return (target) => {
            base(target);
            setMiddlewareMetadata(target as unknown as InjectableClass, {
                scope,
                order,
                phase: scope === 'global' ? (phase ?? 'before') : undefined
            });
        };
    };
}

export const RouteMiddleware = createMiddlewareDecorator('route');
export const GlobalMiddleware = createMiddlewareDecorator('global');

export function UseMiddleware(...tokens: ResolveToken[]): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        if (typeof propertyKey === 'undefined') {
            throw new Error('@UseMiddleware can only be applied to methods.');
        }

        if (!descriptor || typeof descriptor.value !== 'function') {
            throw new Error('@UseMiddleware can only decorate instance methods.');
        }

        appendActionMiddlewares(target.constructor as InjectableClass, propertyKey, tokens);
    };
}

export function ForwardRefInject(
    factory: () => ResolveToken
): ParameterDecorator & PropertyDecorator {
    return Inject(forwardRef(factory));
}

export function Controller(options: ControllerOptions): ClassDecorator {
    const { basePath, middlewares, tags, ...rest } = options;
    if (!basePath) {
        throw new Error('Controller requires a basePath.');
    }

    const normalizedBase = basePath.startsWith('/') ? basePath : `/${basePath}`;
    const decorator = Injectable({ ...rest, type: ServiceType.Controller, middlewares });

    return (target) => {
        decorator(target);
        setControllerMetadata(target as unknown as InjectableClass, {
            basePath: normalizedBase,
            middlewares,
            tags
        });
    };
}

export function Route(metadata: RouteOptions): MethodDecorator {
    const { method, path } = metadata;
    if (!method || !path) {
        throw new Error('Route decorator requires both method and path.');
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return (target, propertyKey, descriptor) => {
        if (typeof propertyKey === 'undefined') {
            throw new Error('@Route can only be applied to controller methods.');
        }

        if (!descriptor || typeof descriptor.value !== 'function') {
            throw new Error('@Route can only decorate instance methods.');
        }

        const controller = target.constructor as InjectableClass;
        setActionRoute(controller, propertyKey, {
            ...metadata,
            path: normalizedPath
        });
    };
}
