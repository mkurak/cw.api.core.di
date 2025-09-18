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
    SessionInfo
} from './types';
import { getParameterInjections } from './metadata';

interface InternalRegistration extends Registration {
    singletonInstance?: unknown;
}

type InstanceMap = Map<string, unknown>;

function isConstructorToken<T>(token: ResolveToken<T>): token is InjectableClass<T> {
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
    private readonly sessionStorage = new AsyncLocalStorage<string>();
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
        const registration = this.getRegistration(token);
        if (!registration) {
            const name = isConstructorToken(token) ? token.name : token;
            throw new Error(`No registration found for token: ${name}`);
        }

        switch (registration.lifecycle) {
            case Lifecycle.Singleton:
                return this.resolveSingleton(registration, options) as T;
            case Lifecycle.Transient:
                return this.instantiate(registration, options) as T;
            case Lifecycle.Scoped: {
                const sessionId = options.sessionId ?? this.sessionStorage.getStore();
                if (!sessionId) {
                    throw new Error(
                        `Scoped service "${registration.token}" resolved without an active session. Use createSession/runInSession.`
                    );
                }
                return this.resolveScoped(registration, sessionId) as T;
            }
            default:
                return this.instantiate(registration, options) as T;
        }
    }

    getRegistration(token: ResolveToken): InternalRegistration | undefined {
        if (isConstructorToken(token)) {
            return this.registrationsByCtor.get(token as InjectableClass);
        }
        return this.registrationsByToken.get(token);
    }

    getSessionInfo(sessionId: string): SessionInfo | undefined {
        return this.sessionInfos.get(sessionId);
    }

    createSession(): SessionInfo {
        const id = `session-${++this.sessionCounter}`;
        this.sessions.set(id, new Map());
        const info: SessionInfo = { id, createdAt: Date.now() };
        this.sessionInfos.set(id, info);
        return info;
    }

    runInSession<T>(callback: () => T | Promise<T>, existingSessionId?: string): Promise<T> | T {
        if (existingSessionId) {
            if (!this.sessions.has(existingSessionId)) {
                throw new Error(`Session "${existingSessionId}" not found.`);
            }
            return this.sessionStorage.run(existingSessionId, () => callback());
        }

        const sessionInfo = this.createSession();
        const sessionId = sessionInfo.id;
        const result = this.sessionStorage.run(sessionId, () => callback());

        if (result instanceof Promise) {
            return result.finally(() => {
                this.destroySession(sessionId);
            });
        }

        this.destroySession(sessionId);
        return result;
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

    private instantiate(registration: InternalRegistration, options: ResolveOptions = {}): unknown {
        const paramTypes = Reflect.getMetadata('design:paramtypes', registration.target) as
            | Array<InjectableClass | undefined>
            | undefined;
        const injections = getParameterInjections(registration.target);

        if (!paramTypes || paramTypes.length === 0) {
            return new registration.target();
        }

        const args = paramTypes.map((paramType, index) => {
            const override = injections?.[index];
            const token = override ?? paramType;

            if (!token || token === Object || token === Function) {
                throw new Error(
                    `Cannot resolve constructor parameter at position ${index} for service "${registration.token}". Use @Inject to specify a token.`
                );
            }

            return this.resolve(token as ResolveToken, options);
        });

        return new registration.target(...args);
    }

    private resolveSingleton(
        registration: InternalRegistration,
        options: ResolveOptions = {}
    ): unknown {
        if (!registration.singletonInstance) {
            registration.singletonInstance = this.instantiate(registration, options);
        }
        return registration.singletonInstance;
    }

    private resolveScoped(registration: InternalRegistration, sessionId: string): unknown {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session "${sessionId}" not found when resolving scoped service.`);
        }

        if (!session.has(registration.token)) {
            session.set(registration.token, this.instantiate(registration, { sessionId }));
        }

        return session.get(registration.token);
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
