import 'reflect-metadata';
import type {
    ControllerMetadata,
    InjectableClass,
    MiddlewareClassMetadata,
    ResolveToken,
    RouteMetadata
} from './types';

const PARAM_INJECT_KEY = Symbol.for('cw.api.core.di:paraminject');
const OPTIONAL_PARAM_KEY = Symbol.for('cw.api.core.di:paramoptional');
const PROPERTY_INJECT_KEY = Symbol.for('cw.api.core.di:propertyinject');
const ACTION_MIDDLEWARES_KEY = Symbol.for('cw.api.core.di:actionmiddlewares');
const MIDDLEWARE_META_KEY = Symbol.for('cw.api.core.di:middlewaremeta');
const CONTROLLER_META_KEY = Symbol.for('cw.api.core.di:controller');
const ACTION_ROUTE_META_KEY = Symbol.for('cw.api.core.di:actionroute');

export type InjectMetadata = Record<number, ResolveToken>;
export type OptionalMetadata = Set<number>;
export type PropertyMetadata = Map<string | symbol, ResolveToken>;
export type ActionMiddlewareMap = Map<string | symbol, ResolveToken[]>;
export type ActionRouteMap = Map<string | symbol, RouteMetadata>;

function assertControllerRegistered(controller: InjectableClass): void {
    if (!Reflect.hasMetadata(CONTROLLER_META_KEY, controller)) {
        throw new Error(
            `Class "${controller.name}" must be decorated with @Controller to access route metadata.`
        );
    }
}

export function setParameterInjection(
    target: InjectableClass,
    index: number,
    token: ResolveToken
): void {
    const existing =
        (Reflect.getOwnMetadata(PARAM_INJECT_KEY, target) as InjectMetadata | undefined) ?? {};
    existing[index] = token;
    Reflect.defineMetadata(PARAM_INJECT_KEY, existing, target);
}

export function getParameterInjections(target: InjectableClass): InjectMetadata | undefined {
    return Reflect.getMetadata(PARAM_INJECT_KEY, target) as InjectMetadata | undefined;
}

export function markParameterOptional(target: InjectableClass, index: number): void {
    const existing =
        (Reflect.getOwnMetadata(OPTIONAL_PARAM_KEY, target) as OptionalMetadata | undefined) ??
        new Set<number>();
    existing.add(index);
    Reflect.defineMetadata(OPTIONAL_PARAM_KEY, existing, target);
}

export function getOptionalParameters(target: InjectableClass): OptionalMetadata | undefined {
    return Reflect.getMetadata(OPTIONAL_PARAM_KEY, target) as OptionalMetadata | undefined;
}

export function setPropertyInjection(
    target: InjectableClass,
    propertyKey: string | symbol,
    token: ResolveToken
): void {
    const existing =
        (Reflect.getOwnMetadata(PROPERTY_INJECT_KEY, target.prototype) as
            | PropertyMetadata
            | undefined) ?? new Map<string | symbol, ResolveToken>();
    existing.set(propertyKey, token);
    Reflect.defineMetadata(PROPERTY_INJECT_KEY, existing, target.prototype);
}

export function getPropertyInjections(target: InjectableClass): PropertyMetadata | undefined {
    return Reflect.getMetadata(PROPERTY_INJECT_KEY, target.prototype) as
        | PropertyMetadata
        | undefined;
}

export function appendActionMiddlewares(
    controller: InjectableClass,
    propertyKey: string | symbol,
    tokens: ResolveToken[]
): void {
    if (!tokens || tokens.length === 0) {
        return;
    }

    const existing =
        (Reflect.getOwnMetadata(ACTION_MIDDLEWARES_KEY, controller) as
            | ActionMiddlewareMap
            | undefined) ?? new Map<string | symbol, ResolveToken[]>();
    const current = existing.get(propertyKey) ?? [];
    const next = current.slice();
    for (const token of tokens) {
        next.push(token);
    }
    existing.set(propertyKey, next);
    Reflect.defineMetadata(ACTION_MIDDLEWARES_KEY, existing, controller);
}

export function getActionMiddlewares(
    controller: InjectableClass,
    propertyKey: string | symbol
): ResolveToken[] | undefined {
    assertControllerRegistered(controller);
    const map = Reflect.getMetadata(ACTION_MIDDLEWARES_KEY, controller) as
        | ActionMiddlewareMap
        | undefined;
    const tokens = map?.get(propertyKey);
    return tokens ? tokens.slice() : undefined;
}

export function setMiddlewareMetadata(
    target: InjectableClass,
    metadata: MiddlewareClassMetadata
): void {
    Reflect.defineMetadata(MIDDLEWARE_META_KEY, metadata, target);
}

export function getMiddlewareMetadata(
    target: InjectableClass
): MiddlewareClassMetadata | undefined {
    return Reflect.getMetadata(MIDDLEWARE_META_KEY, target) as MiddlewareClassMetadata | undefined;
}

export function ensureMiddlewareContract(target: InjectableClass): void {
    if (typeof target.prototype.handle !== 'function') {
        throw new Error(`Middleware "${target.name}" must implement a handle method.`);
    }
}

export function setControllerMetadata(target: InjectableClass, metadata: ControllerMetadata): void {
    Reflect.defineMetadata(CONTROLLER_META_KEY, metadata, target);
}

export function getControllerMetadata(target: InjectableClass): ControllerMetadata | undefined {
    return Reflect.getMetadata(CONTROLLER_META_KEY, target) as ControllerMetadata | undefined;
}

export function setActionRoute(
    controller: InjectableClass,
    propertyKey: string | symbol,
    metadata: RouteMetadata
): void {
    const existing =
        (Reflect.getOwnMetadata(ACTION_ROUTE_META_KEY, controller) as ActionRouteMap | undefined) ??
        new Map<string | symbol, RouteMetadata>();
    existing.set(propertyKey, { ...metadata });
    Reflect.defineMetadata(ACTION_ROUTE_META_KEY, existing, controller);
}

export function getActionRoute(
    controller: InjectableClass,
    propertyKey: string | symbol
): RouteMetadata | undefined {
    assertControllerRegistered(controller);
    const map = Reflect.getMetadata(ACTION_ROUTE_META_KEY, controller) as
        | ActionRouteMap
        | undefined;
    const route = map?.get(propertyKey);
    return route ? { ...route } : undefined;
}

export function getControllerRoutes(controller: InjectableClass): Array<{
    propertyKey: string | symbol;
    route: RouteMetadata;
}> {
    assertControllerRegistered(controller);
    const map = Reflect.getMetadata(ACTION_ROUTE_META_KEY, controller) as
        | ActionRouteMap
        | undefined;

    if (!map) {
        return [];
    }

    return Array.from(map.entries()).map(([propertyKey, route]) => ({
        propertyKey,
        route: { ...route }
    }));
}
