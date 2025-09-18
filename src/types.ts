export enum ServiceType {
    Service = 'service',
    Controller = 'controller',
    Action = 'action',
    Repository = 'repository',
    Entity = 'entity',
    Middleware = 'middleware'
}

export enum Lifecycle {
    Singleton = 'singleton',
    Scoped = 'scoped',
    Transient = 'transient'
}

export interface InjectableOptions {
    name?: string;
    type?: ServiceType;
    lifecycle?: Lifecycle;
    middlewares?: ResolveToken[];
}

export interface Registration<T = unknown> {
    token: string;
    type: ServiceType;
    lifecycle: Lifecycle;
    target: InjectableClass<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InjectableClass<T = unknown> = new (...args: any[]) => T;

export interface ForwardRef<T = unknown> {
    forwardRef: () => ResolveToken<T>;
}

export type ResolveToken<T = unknown> = string | InjectableClass<T> | ForwardRef<T>;

export function forwardRef<T>(factory: () => ResolveToken<T>): ForwardRef<T> {
    return { forwardRef: factory };
}

export function isForwardRef<T>(token: ResolveToken<T>): token is ForwardRef<T> {
    return typeof token === 'object' && token !== null && 'forwardRef' in token;
}

export type MiddlewareScope = 'route' | 'global';

export interface MiddlewareClassMetadata {
    scope: MiddlewareScope;
    order: number;
}

export interface MiddlewareHandler {
    handle: (...args: unknown[]) => unknown | Promise<unknown>;
}

export interface ResolveOptions {
    sessionId?: string;
}

export interface SessionInfo {
    id: string;
    createdAt: number;
}
