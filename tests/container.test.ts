import { Injectable } from '../src/decorators';
import { getContainer, resetContainer } from '../src/instance';
import { Lifecycle, ServiceType } from '../src/types';

describe('Container registration and listing', () => {
    beforeEach(async () => {
        await resetContainer();
    });

    it('registers classes via decorator with defaults', () => {
        @Injectable()
        class Sample {}

        const container = getContainer();
        const list = container.list();

        expect(list).toHaveLength(1);
        expect(list[0]).toEqual(
            expect.objectContaining({
                token: 'Sample',
                type: ServiceType.Service,
                lifecycle: Lifecycle.Singleton,
                target: Sample
            })
        );
    });

    it('allows filtering by service type', () => {
        @Injectable({ type: ServiceType.Controller })
        class ControllerA {}

        @Injectable({ type: ServiceType.Entity })
        class EntityA {}

        const container = getContainer();
        const controllers = container.list(ServiceType.Controller);
        const entities = container.list(ServiceType.Entity);

        expect(controllers.map((item) => item.target)).toEqual([ControllerA]);
        expect(entities.map((item) => item.target)).toEqual([EntityA]);
    });

    it('prevents duplicate registration with different targets', () => {
        const container = getContainer();

        @Injectable({ name: 'shared' })
        class First {}
        void First;

        expect(() => {
            @Injectable({ name: 'shared' })
            class Second {}
            // Force usage to avoid TS unused errors
            void Second;
        }).toThrow('already exists');

        expect(container.list()).toHaveLength(1);
    });
});
