import 'reflect-metadata';
import type { InjectableClass, ResolveToken } from './types';

const PARAM_INJECT_KEY = Symbol.for('cw.api.core.di:paraminject');

export type InjectMetadata = Record<number, ResolveToken>;

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
