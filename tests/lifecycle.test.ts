import { Injectable } from '../src/decorators';
import { getContainer, resetContainer } from '../src/instance';
import { Lifecycle } from '../src/types';

describe('Lifecycles', () => {
    beforeEach(() => {
        resetContainer();
    });

    it('returns same instance for singleton services', () => {
        @Injectable({ lifecycle: Lifecycle.Singleton, name: 'singleton' })
        class SingletonService {
            value = Math.random();
        }

        const container = getContainer();
        const a = container.resolve<SingletonService>('singleton');
        const b = container.resolve<SingletonService>('singleton');
        expect(a).toBe(b);
    });

    it('creates new instance for transient services', () => {
        @Injectable({ lifecycle: Lifecycle.Transient, name: 'transient' })
        class TransientService {
            value = Math.random();
        }

        const container = getContainer();
        const a = container.resolve<TransientService>('transient');
        const b = container.resolve<TransientService>('transient');
        expect(a).not.toBe(b);
    });

    it('reuses scoped instances within the same session', () => {
        @Injectable({ lifecycle: Lifecycle.Scoped, name: 'scoped' })
        class ScopedService {
            value = Math.random();
        }

        const container = getContainer();
        const session = container.createSession();
        const otherSession = container.createSession();

        const a = container.resolve<ScopedService>('scoped', { sessionId: session.id });
        const b = container.resolve<ScopedService>('scoped', { sessionId: session.id });
        const c = container.resolve<ScopedService>('scoped', { sessionId: otherSession.id });

        expect(a).toBe(b);
        expect(a).not.toBe(c);

        container.destroySession(session.id);
        container.destroySession(otherSession.id);
    });

    it('throws when resolving scoped service without session context', () => {
        @Injectable({ lifecycle: Lifecycle.Scoped, name: 'scoped-throw' })
        class ScopedService {}
        void ScopedService;

        const container = getContainer();
        expect(() => container.resolve('scoped-throw')).toThrow('Scoped service');
    });

    it('supports runInSession helper', async () => {
        @Injectable({ lifecycle: Lifecycle.Scoped, name: 'scoped-session' })
        class ScopedService {
            value = Math.random();
        }

        const container = getContainer();

        const [first, second] = await container.runInSession(async () => {
            const one = container.resolve<ScopedService>('scoped-session');
            const two = container.resolve<ScopedService>('scoped-session');
            return [one, two] as const;
        });

        expect(first).toBe(second);
    });
});
