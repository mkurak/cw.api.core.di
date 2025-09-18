import 'reflect-metadata';
import { Injectable } from '../src/decorators';
import { getContainer, resetContainer } from '../src/instance';
import { Lifecycle } from '../src/types';
import { createModule, registerModules } from '../src';

describe('Module registration', () => {
    beforeEach(async () => {
        await resetContainer();
    });

    it('registers module providers and imports', () => {
        @Injectable({ lifecycle: Lifecycle.Singleton })
        class Repo {}

        @Injectable({ lifecycle: Lifecycle.Transient })
        class Service {
            constructor(public repo: Repo) {}
        }

        const repoModule = createModule({ providers: [Repo] });
        const serviceModule = createModule({ imports: [repoModule], providers: [Service] });

        const container = getContainer();
        container.registerModule(serviceModule);

        const service = container.resolve(Service);
        expect(service).toBeInstanceOf(Service);
        expect(service.repo).toBeInstanceOf(Repo);
    });

    it('supports provider config with custom tokens', () => {
        class Custom {}

        const customModule = createModule({
            providers: [
                {
                    provide: 'custom.token',
                    useClass: Custom,
                    options: { lifecycle: Lifecycle.Transient }
                }
            ]
        });

        const container = getContainer();
        container.registerModule(customModule);

        const instance = container.resolve<Custom>('custom.token');
        expect(instance).toBeInstanceOf(Custom);
    });

    it('registers modules idempotently and via helper', () => {
        @Injectable()
        class One {}

        const moduleRef = createModule({ providers: [One] });
        const container = getContainer();

        registerModules(container, moduleRef, moduleRef);

        const first = container.resolve(One);
        const second = container.resolve(One);
        expect(first).toBeInstanceOf(One);
        expect(second).toBe(first);
    });
});
