import 'reflect-metadata';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
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
import { getOptionalParameters, getParameterInjections, getPropertyInjections } from './metadata';

interface InternalRegistration extends Registration {
    singletonInstance?: unknown;
}

type InstanceMap = Map<string, unknown>;

interface ScopeContext {
    sessionId: string;
    scope?: string;
}

function isConstructorToken(token: ResolveToken): token is InjectableClass {
    return typeof token === 'function';
}

function generateToken(target: InjectableClass, options: InjectableOptions): string {
    return options.name ?? target.name ?? 'anonymous';
}

export class Container {
    private registrationsByToken = new Map<string, InternalRegistration>();
    private registrationsByCtor = new WeakMap<InjectableClass, InternalRegistration>();
    private sessions = new Map<string, InstanceMap>();
    private sessionInfos = new Map<string, SessionInfo>();
    private readonly sessionStorage = new AsyncLocalStorage<ScopeContext>();
    private sessionCounter = 0;

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

    list(type?: ServiceType): Registration[] {
        const registrations = Array.from(this.registrationsByToken.values());
        if (!type) {
            return registrations;
        }
        return registrations.filter((reg) => reg.type === type);
    }

    resolve<T>(token: ResolveToken<T>, options: ResolveOptions = {}): T {
        const registration = this.findRegistration(token);
        if (!registration) {
            throw new Error(`No registration found for token: ${this.describeToken(token)}`);
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
            return result.finally(() => {
                this.destroySession(sessionInfo.id);
            });
        }

        this.destroySession(sessionInfo.id);
        return result;
    }

    runInScope<T>(scopeName: string, callback: () => T | Promise<T>, existingSessionId?: string) {
        return this.runInSession(callback, existingSessionId, scopeName);
    }

    destroySession(sessionId: string): void {
        const instances = this.sessions.get(sessionId);
        if (instances) {
            for (const instance of instances.values()) {
                this.disposeIfPossible(instance);
            }
        }
        this.sessions.delete(sessionId);
        this.sessionInfos.delete(sessionId);
    }

    clear(): void {
        this.registrationsByToken = new Map();
        this.registrationsByCtor = new WeakMap();
        this.sessions = new Map();
        this.sessionInfos = new Map();
        this.sessionCounter = 0;
    }

    private resolveRegistration(
        registration: InternalRegistration,
        options: ResolveOptions,
        path: string[],
        parentLifecycle: Lifecycle | undefined
    ): unknown {
        const identifier = registration.token;

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

        const nextPath = [...path, identifier];

        switch (registration.lifecycle) {
            case Lifecycle.Singleton:
                return this.resolveSingleton(registration, options, nextPath);
            case Lifecycle.Scoped: {
                const sessionId = options.sessionId ?? this.sessionStorage.getStore()?.sessionId;
                if (!sessionId) {
                    throw new Error(
                        `Scoped service "${registration.token}" resolved without an active session. Use createSession/runInSession.`
                    );
                }
                return this.resolveScoped(registration, sessionId, options, nextPath);
            }
            case Lifecycle.Transient:
            default:
                return this.instantiate(registration, options, nextPath, registration.lifecycle);
        }
    }

    private resolveSingleton(
        registration: InternalRegistration,
        options: ResolveOptions,
        path: string[]
    ): unknown {
        if (!registration.singletonInstance) {
            registration.singletonInstance = this.instantiate(
                registration,
                options,
                path,
                registration.lifecycle
            );
        }
        return registration.singletonInstance;
    }

    private resolveScoped(
        registration: InternalRegistration,
        sessionId: string,
        options: ResolveOptions,
        path: string[]
    ): unknown {
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

        if (!session.has(registration.token)) {
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

        return session.get(registration.token);
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

        return this.instantiateWithProperties(instance, options, path, parentLifecycle);
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
            const value = this.resolvePropertyDependency(
                token,
                designType,
                options,
                path,
                parentLifecycle,
                ctor.name,
                key
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
        propertyKey: string | symbol
    ): unknown {
        const { token: unwrappedToken, usedForward } = this.unwrapToken(token);
        const registration = this.findRegistration(unwrappedToken);

        if (!registration) {
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

    private disposeIfPossible(instance: unknown): void {
        if (
            instance &&
            (typeof instance === 'object' || typeof instance === 'function') &&
            'dispose' in instance &&
            typeof (instance as { dispose: () => void }).dispose === 'function'
        ) {
            try {
                (instance as { dispose: () => void }).dispose();
            } catch {
                // ignore
            }
        }
    }
}
