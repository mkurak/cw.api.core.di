import 'reflect-metadata';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
    ContainerEventListener,
    ContainerEventMap,
    ContainerEventName,
    ContainerLogEntry,
    ContainerLogOptions,
    ChildContainerOptions,
    InjectableClass,
    InjectableOptions,
    Lifecycle,
    Registration,
    ResolveOptions,
    ResolveToken,
    ServiceType,
    SessionInfo,
    isForwardRef
} from './types';
import type { ModuleRef } from './module';
import {
    getOptionalParameters,
    getParameterInjections,
    getPropertyInjections,
    isPropertyOptional
} from './metadata';

interface InternalRegistration extends Registration {
    singletonInstance?: unknown;
}

type InstanceMap = Map<string, unknown>;

interface ScopeContext {
    sessionId: string;
    scope?: string;
}

type ListenerSet = Set<ContainerEventListener<ContainerEventName>>;

interface InheritanceRules {
    includeStrings?: Set<string>;
    includeCtors?: Set<InjectableClass>;
    excludeStrings?: Set<string>;
    excludeCtors?: Set<InjectableClass>;
}

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'then' in value &&
        typeof (value as { then: unknown }).then === 'function'
    );
}

function debugSink(...args: unknown[]): void {
    if (typeof console === 'undefined') {
        return;
    }
    const fn = typeof console.debug === 'function' ? console.debug : console.log;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fn as (...params: any[]) => void).apply(console, args as unknown[]);
}

const DEFAULT_TRACE_SINK = (entry: ContainerLogEntry): void => {
    const prefix = `[container:${entry.event}]`;
    switch (entry.event) {
        case 'resolve:start': {
            const payload = entry.payload as ContainerEventMap['resolve:start'];
            debugSink(
                prefix,
                payload.token,
                'path=',
                payload.path.join(' -> '),
                'lifecycle=',
                payload.lifecycle
            );
            break;
        }
        case 'resolve:success': {
            const payload = entry.payload as ContainerEventMap['resolve:success'];
            debugSink(
                prefix,
                payload.token,
                'cached=',
                payload.cached,
                'duration=',
                `${payload.duration.toFixed(2)}ms`
            );
            break;
        }
        case 'resolve:error': {
            const payload = entry.payload as ContainerEventMap['resolve:error'];
            debugSink(prefix, payload.token, 'error=', payload.error.message);
            break;
        }
        case 'instantiate': {
            const payload = entry.payload as ContainerEventMap['instantiate'];
            debugSink(prefix, payload.token, 'path=', payload.path.join(' -> '));
            break;
        }
        case 'dispose': {
            const payload = entry.payload as ContainerEventMap['dispose'];
            debugSink(prefix, payload.token, 'session=', payload.sessionId ?? 'unknown');
            break;
        }
        default:
            debugSink(prefix, entry.payload);
    }
};

function isConstructorToken(token: ResolveToken): token is InjectableClass {
    return typeof token === 'function';
}

function generateToken(target: InjectableClass, options: InjectableOptions): string {
    return options.name ?? target.name ?? 'anonymous';
}

export class Container {
    private readonly parent?: Container;
    private readonly inheritance?: InheritanceRules;
    private registrationsByToken = new Map<string, InternalRegistration>();
    private registrationsByCtor = new WeakMap<InjectableClass, InternalRegistration>();
    private sessions = new Map<string, InstanceMap>();
    private sessionInfos = new Map<string, SessionInfo>();
    private readonly sessionStorage = new AsyncLocalStorage<ScopeContext>();
    private sessionCounter = 0;
    private registeredModules = new Set<ModuleRef>();
    private listeners = new Map<ContainerEventName, ListenerSet>();

    constructor(parent?: Container, inheritance?: InheritanceRules) {
        this.parent = parent;
        this.inheritance = inheritance;
    }

    register(target: InjectableClass, options: InjectableOptions = {}): Registration {
        const token = generateToken(target, options);
        const type = options.type ?? ServiceType.Service;
        const lifecycle = options.lifecycle ?? Lifecycle.Singleton;

        if (this.registrationsByToken.has(token)) {
            const existing = this.registrationsByToken.get(token)!;
            if (existing.target !== target) {
                throw new Error(
                    `A registration with token "${token}" already exists for another target.`
                );
            }
            return existing;
        }

        const registration: InternalRegistration = {
            token,
            type,
            lifecycle,
            target
        };

        this.registrationsByToken.set(token, registration);
        this.registrationsByCtor.set(target, registration);

        return registration;
    }

    registerModule(module: ModuleRef): void {
        if (this.registeredModules.has(module)) {
            return;
        }

        this.registeredModules.add(module);
        module.configure(this);
    }

    list(type?: ServiceType): Registration[] {
        const aggregated = new Map<string, Registration>();

        if (this.parent) {
            for (const registration of this.parent.list(type)) {
                if (this.canInheritRegistration(registration)) {
                    aggregated.set(registration.token, registration);
                }
            }
        }

        for (const registration of this.registrationsByToken.values()) {
            if (!type || registration.type === type) {
                aggregated.set(registration.token, registration);
            }
        }

        return Array.from(aggregated.values());
    }

    resolve<T>(token: ResolveToken<T>, options: ResolveOptions = {}): T {
        const registration = this.findRegistration(token);
        if (!registration) {
            if (this.parent && this.canInheritToken(token)) {
                return this.parent.resolve(token, options);
            }
            const message = this.parent
                ? `Token "${this.describeToken(token)}" is not available in this container.`
                : `No registration found for token: ${this.describeToken(token)}`;
            throw new Error(message);
        }

        const normalized = this.normalizeResolveOptions(options);
        return this.resolveRegistration(registration, normalized, [], undefined) as T;
    }

    getSessionInfo(sessionId: string): SessionInfo | undefined {
        return this.sessionInfos.get(sessionId);
    }

    createSession(scope?: string): SessionInfo {
        const id = `session-${++this.sessionCounter}`;
        this.sessions.set(id, new Map());
        const info: SessionInfo = { id, createdAt: Date.now(), scope };
        this.sessionInfos.set(id, info);
        return info;
    }

    runInSession<T>(
        callback: () => T | Promise<T>,
        existingSessionId?: string,
        scopeName?: string
    ): Promise<T> | T {
        if (existingSessionId) {
            const info = this.sessionInfos.get(existingSessionId);
            if (!info) {
                throw new Error(`Session "${existingSessionId}" not found.`);
            }

            if (scopeName && info.scope && info.scope !== scopeName) {
                throw new Error(
                    `Session "${existingSessionId}" belongs to scope "${info.scope}" which does not match requested scope "${scopeName}".`
                );
            }

            return this.sessionStorage.run(
                { sessionId: existingSessionId, scope: info.scope },
                () => callback()
            );
        }

        const sessionInfo = this.createSession(scopeName);
        const context: ScopeContext = { sessionId: sessionInfo.id, scope: sessionInfo.scope };
        const result = this.sessionStorage.run(context, () => callback());

        if (result instanceof Promise) {
            return result.finally(() => this.destroySession(sessionInfo.id));
        }

        const cleanup = this.destroySession(sessionInfo.id);
        if (cleanup && isPromiseLike(cleanup)) {
            return cleanup.then(() => result);
        }
        return result;
    }

    runInScope<T>(scopeName: string, callback: () => T | Promise<T>, existingSessionId?: string) {
        return this.runInSession(callback, existingSessionId, scopeName);
    }

    destroySession(sessionId: string): Promise<void> | void {
        const instances = this.sessions.get(sessionId);
        const scope = this.sessionInfos.get(sessionId)?.scope;
        const asyncDisposals: Promise<void>[] = [];

        if (instances) {
            for (const [token, instance] of instances.entries()) {
                this.emit('dispose', { token, sessionId, scope, instance });
                const result = this.disposeAsyncIfPossible(instance);
                if (result && isPromiseLike(result)) {
                    asyncDisposals.push(Promise.resolve(result).catch(() => undefined));
                }
            }
        }

        this.sessions.delete(sessionId);
        this.sessionInfos.delete(sessionId);

        if (asyncDisposals.length > 0) {
            return Promise.all(asyncDisposals).then(() => undefined);
        }
    }

    clear(): Promise<void> | void {
        const disposals: Promise<void>[] = [];

        for (const sessionId of Array.from(this.sessions.keys())) {
            const result = this.destroySession(sessionId);
            if (result && isPromiseLike(result)) {
                disposals.push(Promise.resolve(result).catch(() => undefined));
            }
        }

        for (const registration of this.registrationsByToken.values()) {
            if (registration.singletonInstance) {
                this.emit('dispose', {
                    token: registration.token,
                    sessionId: undefined,
                    scope: undefined,
                    instance: registration.singletonInstance
                });
                const result = this.disposeAsyncIfPossible(registration.singletonInstance);
                if (result && isPromiseLike(result)) {
                    disposals.push(Promise.resolve(result).catch(() => undefined));
                }
                registration.singletonInstance = undefined;
            }
        }

        this.registrationsByToken = new Map();
        this.registrationsByCtor = new WeakMap();
        this.sessions = new Map();
        this.sessionInfos = new Map();
        this.sessionCounter = 0;
        this.registeredModules = new Set<ModuleRef>();

        if (disposals.length > 0) {
            return Promise.all(disposals).then(() => undefined);
        }
    }

    createChild(options?: ChildContainerOptions): Container {
        const inheritance = this.normalizeChildOptions(options);
        return new Container(this, inheritance);
    }

    private normalizeChildOptions(options?: ChildContainerOptions): InheritanceRules | undefined {
        if (!options) {
            return undefined;
        }

        const includeStrings = new Set<string>();
        const includeCtors = new Set<InjectableClass>();
        const excludeStrings = new Set<string>();
        const excludeCtors = new Set<InjectableClass>();

        const process = (
            tokens: ResolveToken[] | undefined,
            outStrings: Set<string>,
            outCtors: Set<InjectableClass>
        ) => {
            if (!tokens) {
                return;
            }
            for (const token of tokens) {
                const { token: unwrapped } = this.unwrapToken(token);
                const description = this.describeToken(unwrapped);
                outStrings.add(description);
                if (isConstructorToken(unwrapped)) {
                    outCtors.add(unwrapped as InjectableClass);
                }
            }
        };

        process(options.include, includeStrings, includeCtors);
        process(options.exclude, excludeStrings, excludeCtors);

        if (
            includeStrings.size === 0 &&
            includeCtors.size === 0 &&
            excludeStrings.size === 0 &&
            excludeCtors.size === 0
        ) {
            return undefined;
        }

        return {
            includeStrings: includeStrings.size ? includeStrings : undefined,
            includeCtors: includeCtors.size ? includeCtors : undefined,
            excludeStrings: excludeStrings.size ? excludeStrings : undefined,
            excludeCtors: excludeCtors.size ? excludeCtors : undefined
        };
    }

    private canInheritRegistration(registration: Registration): boolean {
        if (!this.parent) {
            return false;
        }
        if (!this.inheritance) {
            return true;
        }

        const { includeStrings, includeCtors, excludeStrings, excludeCtors } = this.inheritance;

        if (excludeStrings?.has(registration.token)) {
            return false;
        }

        if (excludeCtors?.has(registration.target)) {
            return false;
        }

        const hasInclude =
            (includeStrings && includeStrings.size > 0) || (includeCtors && includeCtors.size > 0);

        if (!hasInclude) {
            return true;
        }

        if (includeStrings?.has(registration.token)) {
            return true;
        }

        if (includeCtors?.has(registration.target)) {
            return true;
        }

        return false;
    }

    private canInheritToken(token: ResolveToken): boolean {
        if (!this.parent) {
            return false;
        }
        if (!this.inheritance) {
            return true;
        }

        const { includeStrings, includeCtors, excludeStrings, excludeCtors } = this.inheritance;
        const { token: unwrapped } = this.unwrapToken(token);
        const description = this.describeToken(unwrapped);

        if (excludeStrings?.has(description)) {
            return false;
        }

        if (isConstructorToken(unwrapped) && excludeCtors?.has(unwrapped as InjectableClass)) {
            return false;
        }

        const hasInclude =
            (includeStrings && includeStrings.size > 0) || (includeCtors && includeCtors.size > 0);

        if (!hasInclude) {
            return true;
        }

        if (includeStrings?.has(description)) {
            return true;
        }

        if (isConstructorToken(unwrapped) && includeCtors?.has(unwrapped as InjectableClass)) {
            return true;
        }

        return false;
    }

    on<K extends ContainerEventName>(event: K, listener: ContainerEventListener<K>): () => void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(listener as ContainerEventListener<ContainerEventName>);
        return () => this.off(event, listener);
    }

    off<K extends ContainerEventName>(event: K, listener: ContainerEventListener<K>): void {
        const set = this.listeners.get(event);
        if (!set) {
            return;
        }
        set.delete(listener as ContainerEventListener<ContainerEventName>);
        if (set.size === 0) {
            this.listeners.delete(event);
        }
    }

    enableEventLogging(options: ContainerLogOptions = {}): () => void {
        const {
            sink = DEFAULT_TRACE_SINK,
            includeSuccess = true,
            includeInstantiate = true,
            includeDispose = true
        } = options;

        const push = <K extends ContainerEventName>(event: K, payload: ContainerEventMap[K]) =>
            sink({ event, payload, timestamp: Date.now() });

        const subscriptions: Array<() => void> = [];
        subscriptions.push(this.on('resolve:start', (payload) => push('resolve:start', payload)));
        if (includeSuccess) {
            subscriptions.push(
                this.on('resolve:success', (payload) => push('resolve:success', payload))
            );
        }
        subscriptions.push(this.on('resolve:error', (payload) => push('resolve:error', payload)));
        if (includeInstantiate) {
            subscriptions.push(this.on('instantiate', (payload) => push('instantiate', payload)));
        }
        if (includeDispose) {
            subscriptions.push(this.on('dispose', (payload) => push('dispose', payload)));
        }

        return () => {
            for (const unsubscribe of subscriptions) {
                unsubscribe();
            }
        };
    }

    private emit<K extends ContainerEventName>(event: K, payload: ContainerEventMap[K]): void {
        const set = this.listeners.get(event);
        if (!set || set.size === 0) {
            if (this.parent) {
                this.parent.emit(event, payload);
            }
            return;
        }
        for (const listener of Array.from(set)) {
            (listener as ContainerEventListener<K>)(payload);
        }
        if (this.parent) {
            this.parent.emit(event, payload);
        }
    }

    private resolveRegistration(
        registration: InternalRegistration,
        options: ResolveOptions,
        path: string[],
        parentLifecycle: Lifecycle | undefined
    ): unknown {
        const identifier = registration.token;
        const nextPath = [...path, identifier];
        const depth = path.length;
        const snapshotOptions = { ...options };

        const startedAt = Date.now();
        this.emit('resolve:start', {
            token: identifier,
            target: registration.target,
            lifecycle: registration.lifecycle,
            path: nextPath.slice(),
            depth,
            options: snapshotOptions
        });

        try {
            if (path.includes(identifier)) {
                const cycle = [...path, identifier].join(' -> ');
                throw new Error(`Circular dependency detected: ${cycle}`);
            }

            if (
                parentLifecycle === Lifecycle.Singleton &&
                registration.lifecycle === Lifecycle.Scoped
            ) {
                const parent = path[path.length - 1] ?? 'root';
                throw new Error(
                    `Lifecycle violation: singleton service "${parent}" cannot depend on scoped service "${identifier}".`
                );
            }

            const { instance, fromCache } = this.resolveByLifecycle(
                registration,
                options,
                nextPath
            );

            this.emit('resolve:success', {
                token: identifier,
                target: registration.target,
                lifecycle: registration.lifecycle,
                path: nextPath.slice(),
                depth,
                options: snapshotOptions,
                instance,
                cached: fromCache,
                duration: Date.now() - startedAt
            });

            return instance;
        } catch (error) {
            this.emit('resolve:error', {
                token: identifier,
                target: registration.target,
                lifecycle: registration.lifecycle,
                path: nextPath.slice(),
                depth,
                options: snapshotOptions,
                error: error as Error
            });
            throw error;
        }
    }

    private resolveByLifecycle(
        registration: InternalRegistration,
        options: ResolveOptions,
        path: string[]
    ): { instance: unknown; fromCache: boolean } {
        switch (registration.lifecycle) {
            case Lifecycle.Singleton:
                return this.resolveSingleton(registration, options, path);
            case Lifecycle.Scoped: {
                const sessionId = options.sessionId ?? this.sessionStorage.getStore()?.sessionId;
                if (!sessionId) {
                    throw new Error(
                        `Scoped service "${registration.token}" resolved without an active session. Use createSession/runInSession.`
                    );
                }
                return this.resolveScoped(registration, sessionId, options, path);
            }
            case Lifecycle.Transient:
            default:
                return {
                    instance: this.instantiate(registration, options, path, registration.lifecycle),
                    fromCache: false
                };
        }
    }

    private resolveSingleton(
        registration: InternalRegistration,
        options: ResolveOptions,
        path: string[]
    ): { instance: unknown; fromCache: boolean } {
        const cached = Boolean(registration.singletonInstance);
        if (!cached) {
            registration.singletonInstance = this.instantiate(
                registration,
                options,
                path,
                registration.lifecycle
            );
        }
        return { instance: registration.singletonInstance, fromCache: cached };
    }

    private resolveScoped(
        registration: InternalRegistration,
        sessionId: string,
        options: ResolveOptions,
        path: string[]
    ): { instance: unknown; fromCache: boolean } {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session "${sessionId}" not found when resolving scoped service.`);
        }

        const info = this.sessionInfos.get(sessionId);
        if (options.scope && info?.scope && info.scope !== options.scope) {
            throw new Error(
                `Scoped service "${registration.token}" cannot be resolved in scope "${options.scope}" (session owned by "${info.scope}").`
            );
        }

        const effectiveScope = options.scope ?? info?.scope;

        const cached = session.has(registration.token);

        if (!cached) {
            const scopedOptions =
                options.sessionId === sessionId && options.scope === effectiveScope
                    ? options
                    : { ...options, sessionId, scope: effectiveScope };
            const instance = this.instantiate(
                registration,
                scopedOptions,
                path,
                registration.lifecycle
            );
            session.set(registration.token, instance);
        }

        return { instance: session.get(registration.token), fromCache: cached };
    }

    private instantiate(
        registration: InternalRegistration,
        options: ResolveOptions,
        path: string[],
        parentLifecycle: Lifecycle
    ): unknown {
        const paramTypes = Reflect.getMetadata('design:paramtypes', registration.target) as
            | Array<InjectableClass | undefined>
            | undefined;
        const injections = getParameterInjections(registration.target);
        const optionals = getOptionalParameters(registration.target);

        let instance: unknown;

        if (!paramTypes || paramTypes.length === 0) {
            instance = new registration.target();
        } else {
            const args = paramTypes.map((paramType, index) => {
                const hasOverride =
                    injections !== undefined &&
                    Object.prototype.hasOwnProperty.call(injections, index);

                if (
                    !hasOverride &&
                    (!paramType || paramType === Object || paramType === Function)
                ) {
                    if (optionals?.has(index)) {
                        return undefined;
                    }
                    throw new Error(
                        `Cannot resolve constructor parameter at position ${index} for service "${registration.token}". Use @Inject to specify a token.`
                    );
                }

                const rawToken = (hasOverride ? injections![index] : paramType) as ResolveToken;

                return this.resolveDependency(
                    registration,
                    rawToken,
                    paramType,
                    options,
                    path,
                    parentLifecycle,
                    optionals?.has(index) ?? false
                );
            });

            instance = new registration.target(...args);
        }

        const hydrated = this.instantiateWithProperties(instance, options, path, parentLifecycle);

        this.emit('instantiate', {
            token: registration.token,
            target: registration.target,
            lifecycle: registration.lifecycle,
            path: path.slice(),
            depth: path.length - 1
        });

        return hydrated;
    }

    private instantiateWithProperties(
        instance: unknown,
        options: ResolveOptions,
        path: string[],
        parentLifecycle: Lifecycle
    ): unknown {
        if (!instance || (typeof instance !== 'object' && typeof instance !== 'function')) {
            return instance;
        }

        const ctor = (instance as { constructor: InjectableClass }).constructor;
        const properties = getPropertyInjections(ctor);
        if (!properties) {
            return instance;
        }

        for (const [key, token] of properties.entries()) {
            const designType = Reflect.getMetadata('design:type', ctor.prototype, key);
            const optional = isPropertyOptional(ctor, key);
            const value = this.resolvePropertyDependency(
                token,
                designType,
                options,
                path,
                parentLifecycle,
                ctor.name,
                key,
                optional
            );
            (instance as Record<string | symbol, unknown>)[key] = value;
        }

        return instance;
    }

    private resolvePropertyDependency(
        token: ResolveToken,
        designType: unknown,
        options: ResolveOptions,
        path: string[],
        parentLifecycle: Lifecycle,
        ownerName: string,
        propertyKey: string | symbol,
        isOptional: boolean
    ): unknown {
        const { token: unwrappedToken, usedForward } = this.unwrapToken(token);
        const registration = this.findRegistration(unwrappedToken);

        if (!registration) {
            if (isOptional) {
                return undefined;
            }
            throw new Error(
                `No registration found for property "${String(propertyKey)}" on service "${ownerName}".`
            );
        }

        if (usedForward && designType === Function) {
            const captured = this.normalizeResolveOptions(options);
            return () => this.resolveRegistration(registration, captured, [], parentLifecycle);
        }

        return this.resolveRegistration(registration, options, path, parentLifecycle);
    }

    private resolveDependency(
        owner: InternalRegistration,
        rawToken: ResolveToken,
        paramType: InjectableClass | undefined,
        options: ResolveOptions,
        path: string[],
        parentLifecycle: Lifecycle,
        isOptional: boolean
    ): unknown {
        const { token: unwrappedToken, usedForward } = this.unwrapToken(rawToken);
        const registration = this.findRegistration(unwrappedToken);

        if (!registration) {
            if (isOptional) {
                return undefined;
            }
            throw new Error(
                `No registration found for token: ${this.describeToken(unwrappedToken)}`
            );
        }

        if (usedForward && paramType === Function) {
            const captured = this.normalizeResolveOptions(options);
            return () => this.resolveRegistration(registration, captured, [], parentLifecycle);
        }

        return this.resolveRegistration(registration, options, path, parentLifecycle);
    }

    private unwrapToken(token: ResolveToken): { token: ResolveToken; usedForward: boolean } {
        let current: ResolveToken = token;
        let usedForward = false;
        const visited = new Set<object>();

        while (isForwardRef(current)) {
            if (visited.has(current as object)) {
                throw new Error('Circular forwardRef detected.');
            }
            visited.add(current as object);
            current = current.forwardRef();
            usedForward = true;
        }

        return { token: current, usedForward };
    }

    private findRegistration(token: ResolveToken): InternalRegistration | undefined {
        const { token: unwrapped } = this.unwrapToken(token);
        if (typeof unwrapped === 'string') {
            return this.registrationsByToken.get(unwrapped);
        }
        if (isConstructorToken(unwrapped)) {
            return this.registrationsByCtor.get(unwrapped as InjectableClass);
        }
        return undefined;
    }

    private describeToken(token: ResolveToken): string {
        if (typeof token === 'string') {
            return token;
        }
        if (isConstructorToken(token)) {
            return token.name || '[anonymous]';
        }
        if (isForwardRef(token)) {
            return '[forwardRef]';
        }
        return String(token);
    }

    private normalizeResolveOptions(options: ResolveOptions): ResolveOptions {
        const context = this.sessionStorage.getStore();
        let normalized = options;

        if (context) {
            const needsClone =
                normalized.sessionId !== context.sessionId ||
                (context.scope && normalized.scope !== context.scope);

            if (needsClone) {
                normalized = { ...normalized };
            }

            if (!normalized.sessionId) {
                normalized.sessionId = context.sessionId;
            }

            if (context.scope && !normalized.scope) {
                normalized.scope = context.scope;
            }
        }

        if (normalized.sessionId && !normalized.scope) {
            const info = this.sessionInfos.get(normalized.sessionId);
            if (info?.scope) {
                if (normalized === options) {
                    normalized = { ...normalized };
                }
                normalized.scope = info.scope;
            }
        }

        return normalized;
    }

    private disposeAsyncIfPossible(instance: unknown): void | Promise<void> {
        if (
            instance &&
            (typeof instance === 'object' || typeof instance === 'function') &&
            'dispose' in instance &&
            typeof (instance as { dispose: () => unknown }).dispose === 'function'
        ) {
            try {
                const result = (instance as { dispose: () => unknown }).dispose();
                if (result && isPromiseLike(result)) {
                    return Promise.resolve(result)
                        .then(() => undefined)
                        .catch(() => undefined);
                }
            } catch {
                // ignore
            }
        }
    }
}
