import 'reflect-metadata';
import { Injectable, Inject, Optional, ForwardRefInject } from '../src/decorators';
import { getContainer, resetContainer } from '../src/instance';
import { Lifecycle, InjectableClass } from '../src/types';
import { setParameterInjection } from '../src/metadata';

describe('Constructor injection', () => {
    beforeEach(async () => {
        await resetContainer();
    });

    it('auto-resolves dependencies by constructor types', () => {
        @Injectable()
        class Repository {
            id = Math.random();
        }

        @Injectable()
        class Service {
            constructor(public repo: Repository) {}
        }

        const container = getContainer();
        const service = container.resolve(Service);
        expect(service).toBeInstanceOf(Service);
        expect(service.repo).toBeInstanceOf(Repository);
        expect(service.repo).toBe(container.resolve(Repository));
    });

    it('uses @Inject overrides for custom tokens', () => {
        const TOKEN = 'custom-repo';

        @Injectable({ name: TOKEN })
        class CustomRepository {}

        @Injectable()
        class ServiceWithOverride {
            constructor(@Inject(TOKEN) public repo: CustomRepository) {}
        }

        const container = getContainer();
        const service = container.resolve(ServiceWithOverride);
        expect(service.repo).toBeInstanceOf(CustomRepository);
    });

    it('propagates session info to dependencies', async () => {
        @Injectable({ lifecycle: Lifecycle.Scoped })
        class ScopedRepo {}

        @Injectable({ lifecycle: Lifecycle.Scoped })
        class ScopedService {
            constructor(public repo: ScopedRepo) {}
        }

        const container = getContainer();
        const session = container.createSession();
        const serviceA = container.resolve<ScopedService>(ScopedService, {
            sessionId: session.id
        });
        const repoA = container.resolve<ScopedRepo>(ScopedRepo, { sessionId: session.id });
        expect(serviceA.repo).toBe(repoA);
        await container.destroySession(session.id);
    });

    it('throws when dependency cannot be inferred', () => {
        @Injectable()
        class MissingDependency {}

        @Injectable()
        class Consumer {
            constructor(
                public value: unknown,
                private dep: MissingDependency
            ) {}
        }

        const container = getContainer();
        expect(() => container.resolve(Consumer)).toThrow('Cannot resolve constructor parameter');
    });

    it('allows optional parameters to resolve as undefined', () => {
        class OptionalDependency {}

        @Injectable({ lifecycle: Lifecycle.Transient })
        class OptionalService {
            constructor(@Optional() public dep?: OptionalDependency) {}
        }

        const container = getContainer();
        const service = container.resolve(OptionalService);
        expect(service.dep).toBeUndefined();

        container.register(OptionalDependency as unknown as InjectableClass);
        const serviceWithDep = container.resolve(OptionalService);
        expect(serviceWithDep.dep).toBeInstanceOf(OptionalDependency);
    });

    it('injects properties decorated with @Inject', () => {
        const TOKEN = 'logger';

        @Injectable({ name: TOKEN })
        class Logger {}

        @Injectable()
        class Controller {
            @Inject(TOKEN)
            public logger!: Logger;
        }

        const container = getContainer();
        const controller = container.resolve(Controller);
        expect(controller.logger).toBeInstanceOf(Logger);
    });

    it('allows optional property injection to remain undefined when missing', () => {
        const OPTIONAL_TOKEN = 'optional-missing';

        @Injectable()
        class OptionalPropertyHolder {
            @Inject(OPTIONAL_TOKEN)
            @Optional()
            public maybe?: unknown;
        }

        const container = getContainer();
        const holder = container.resolve(OptionalPropertyHolder);
        expect(holder.maybe).toBeUndefined();
    });

    it('resolves optional property when dependency is available', () => {
        const OPTIONAL_TOKEN = 'optional-present';

        @Injectable({ name: OPTIONAL_TOKEN })
        class OptionalDependency {}

        @Injectable()
        class OptionalPropertyHolder {
            @Optional()
            @Inject(OPTIONAL_TOKEN)
            public maybe?: OptionalDependency;
        }

        const container = getContainer();
        const holder = container.resolve(OptionalPropertyHolder);
        expect(holder.maybe).toBeInstanceOf(OptionalDependency);
    });

    it('detects circular dependencies without forwardRef', () => {
        class ServiceA {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            constructor(_: unknown) {}
        }

        class ServiceB {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            constructor(_: unknown) {}
        }

        Injectable({ name: 'serviceA' })(ServiceA);
        Injectable({ name: 'serviceB' })(ServiceB);

        Reflect.defineMetadata('design:paramtypes', [Object], ServiceA);
        Reflect.defineMetadata('design:paramtypes', [Object], ServiceB);

        setParameterInjection(ServiceA as unknown as InjectableClass, 0, 'serviceB');
        setParameterInjection(ServiceB as unknown as InjectableClass, 0, 'serviceA');

        const container = getContainer();
        expect(() => container.resolve<ServiceA>('serviceA')).toThrow(
            /Circular dependency detected/
        );
    });

    it('supports forwardRef via lazy providers to break circular dependencies', () => {
        @Injectable()
        class ForwardServiceB {
            constructor(
                @ForwardRefInject(() => ForwardServiceA)
                private readonly getA: () => ForwardServiceA
            ) {}

            getAInstance() {
                return this.getA();
            }
        }

        @Injectable()
        class ForwardServiceA {
            constructor(
                @ForwardRefInject(() => ForwardServiceB)
                private readonly getB: () => ForwardServiceB
            ) {}

            getBInstance() {
                return this.getB();
            }
        }

        const container = getContainer();
        const a = container.resolve(ForwardServiceA);
        const b = a.getBInstance();
        expect(b).toBeInstanceOf(ForwardServiceB);
        expect(b.getAInstance()).toBeInstanceOf(ForwardServiceA);
    });

    it('prevents singleton services from depending on scoped services', () => {
        @Injectable({ lifecycle: Lifecycle.Scoped })
        class ScopedDependency {}

        @Injectable({ lifecycle: Lifecycle.Singleton })
        class RootService {
            constructor(private readonly scoped: ScopedDependency) {}
        }

        const container = getContainer();
        expect(() => container.resolve(RootService)).toThrow(/Lifecycle violation/);
    });
});
