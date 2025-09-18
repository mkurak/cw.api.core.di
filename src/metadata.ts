import 'reflect-metadata';
import type { InjectableClass, MiddlewareClassMetadata, ResolveToken } from './types';

const PARAM_INJECT_KEY = Symbol.for('cw.api.core.di:paraminject');
const OPTIONAL_PARAM_KEY = Symbol.for('cw.api.core.di:paramoptional');
const PROPERTY_INJECT_KEY = Symbol.for('cw.api.core.di:propertyinject');
const ACTION_MIDDLEWARES_KEY = Symbol.for('cw.api.core.di:actionmiddlewares');
const MIDDLEWARE_META_KEY = Symbol.for('cw.api.core.di:middlewaremeta');

export type InjectMetadata = Record<number, ResolveToken>;
export type OptionalMetadata = Set<number>;
export type PropertyMetadata = Map<string | symbol, ResolveToken>;
export type ActionMiddlewareMetadata = ResolveToken[];

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

export function appendActionMiddlewares(target: InjectableClass, tokens: ResolveToken[]): void {
    if (!tokens || tokens.length === 0) {
        return;
    }

    const existing =
        (Reflect.getOwnMetadata(ACTION_MIDDLEWARES_KEY, target) as
            | ActionMiddlewareMetadata
            | undefined) ?? [];
    const merged = existing.slice();
    for (const token of tokens) {
        merged.push(token);
    }
    Reflect.defineMetadata(ACTION_MIDDLEWARES_KEY, merged, target);
}

export function getActionMiddlewares(
    target: InjectableClass
): ActionMiddlewareMetadata | undefined {
    const result = Reflect.getMetadata(ACTION_MIDDLEWARES_KEY, target) as
        | ActionMiddlewareMetadata
        | undefined;
    return result ? result.slice() : undefined;
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
