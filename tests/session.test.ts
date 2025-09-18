import { Injectable } from '../src/decorators';
import { getContainer, resetContainer } from '../src/instance';
import { Lifecycle } from '../src/types';

describe('Session utilities', () => {
    beforeEach(() => {
        resetContainer();
    });

    it('returns session info and disposes scoped instances on destroy', () => {
        const disposeSpy = jest.fn();

        @Injectable({ lifecycle: Lifecycle.Scoped, name: 'scoped-disposable' })
        class ScopedDisposable {
            dispose(): void {
                disposeSpy();
            }
        }

        const container = getContainer();
        const session = container.createSession();
        const info = container.getSessionInfo(session.id);
        expect(info?.id).toBe(session.id);

        const instance = container.resolve<ScopedDisposable>('scoped-disposable', {
            sessionId: session.id
        });
        expect(instance).toBeInstanceOf(ScopedDisposable);

        container.destroySession(session.id);
        expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it('throws when running in unknown session', () => {
        const container = getContainer();
        expect(() => container.runInSession(() => undefined, 'missing-session')).toThrow(
            'not found'
        );
    });

    it('runInSession without async destroys session automatically', () => {
        @Injectable({ lifecycle: Lifecycle.Scoped, name: 'scoped-sync' })
        class ScopedSync {}

        const container = getContainer();
        const result = container.runInSession(() => {
            return container.resolve<ScopedSync>('scoped-sync');
        });

        const sessionInfo = container.getSessionInfo('session-1');
        expect(sessionInfo).toBeUndefined();
        expect(result).toBeInstanceOf(ScopedSync);
    });

    it('runInScope creates named scope context automatically', () => {
        @Injectable({ lifecycle: Lifecycle.Scoped, name: 'scoped-request' })
        class ScopedRequest {}

        const container = getContainer();

        const instance = container.runInScope('request', () => {
            return container.resolve<ScopedRequest>('scoped-request');
        });

        expect(instance).toBeInstanceOf(ScopedRequest);
    });

    it('runInScope rejects scope mismatches for existing sessions', () => {
        @Injectable({ lifecycle: Lifecycle.Scoped, name: 'scoped-job' })
        class ScopedJob {}

        const container = getContainer();
        const scope = container.createSession('job');
        void ScopedJob;

        expect(() =>
            container.runInScope('request', () => container.resolve('scoped-job'), scope.id)
        ).toThrow('does not match requested scope');

        container.destroySession(scope.id);
    });

    it('resolves by constructor token', () => {
        @Injectable({ lifecycle: Lifecycle.Singleton })
        class ResolverTarget {}

        const container = getContainer();
        const instance = container.resolve(ResolverTarget);
        expect(instance).toBeInstanceOf(ResolverTarget);
    });

    it('throws when resolving unknown token', () => {
        const container = getContainer();
        expect(() => container.resolve('unknown-token')).toThrow('No registration found');
    });
});
