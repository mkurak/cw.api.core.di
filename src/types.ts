export enum ServiceType {
    Service = 'service',
    Controller = 'controller',
    Action = 'action',
    Repository = 'repository',
    Entity = 'entity'
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
}

export interface Registration<T = unknown> {
    token: string;
    type: ServiceType;
    lifecycle: Lifecycle;
    target: InjectableClass<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InjectableClass<T = unknown> = new (...args: any[]) => T;

export type ResolveToken<T = unknown> = string | InjectableClass<T>;

export interface ResolveOptions {
    sessionId?: string;
}

export interface SessionInfo {
    id: string;
    createdAt: number;
}
