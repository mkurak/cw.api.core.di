import { Container, Lifecycle } from '../src';
import { getContainer, resetContainer } from '../src/instance';

describe('Async disposal support', () => {
    beforeEach(async () => {
        await resetContainer();
    });

    it('awaits async dispose when a scoped session ends', async () => {
        const container = new Container();
        let disposed = false;

        class AsyncScopedService {
            async dispose(): Promise<void> {
                await Promise.resolve();
                disposed = true;
            }
        }

        container.register(AsyncScopedService, { lifecycle: Lifecycle.Scoped });

        await container.runInScope('request', async () => {
            container.resolve(AsyncScopedService);
        });

        expect(disposed).toBe(true);
    });

    it('returns a promise for sync callbacks with async scoped dispose', async () => {
        const container = new Container();
        let disposed = false;

        class AsyncScopedSyncCallback {
            async dispose(): Promise<void> {
                await Promise.resolve();
                disposed = true;
            }
        }

        container.register(AsyncScopedSyncCallback, { lifecycle: Lifecycle.Scoped });

        const runResult = container.runInScope('sync', () => {
            container.resolve(AsyncScopedSyncCallback);
            return 'done';
        });

        expect(runResult).toBeInstanceOf(Promise);
        const value = await runResult;
        expect(value).toBe('done');
        expect(disposed).toBe(true);
    });

    it('returns a promise from destroySession when async disposals exist', async () => {
        const container = getContainer();
        let disposed = false;

        class ScopedAsyncDispose {
            async dispose(): Promise<void> {
                await Promise.resolve();
                disposed = true;
            }
        }

        container.register(ScopedAsyncDispose, {
            lifecycle: Lifecycle.Scoped,
            name: 'async-scoped'
        });
        const session = container.createSession();
        container.resolve('async-scoped', { sessionId: session.id });

        const result = container.destroySession(session.id);
        expect(result).toBeInstanceOf(Promise);
        if (result) {
            await result;
        }

        expect(disposed).toBe(true);
    });

    it('awaits async dispose for singleton instances during clear', async () => {
        const container = new Container();
        let disposed = false;

        class AsyncSingleton {
            async dispose(): Promise<void> {
                await Promise.resolve();
                disposed = true;
            }
        }

        container.register(AsyncSingleton, { lifecycle: Lifecycle.Singleton });
        container.resolve(AsyncSingleton);

        class AsyncScopedForClear {
            async dispose(): Promise<void> {
                await Promise.resolve();
            }
        }
        container.register(AsyncScopedForClear, { lifecycle: Lifecycle.Scoped });
        const scope = container.createSession('clear-scope');
        container.resolve(AsyncScopedForClear, { sessionId: scope.id });

        await container.clear();

        expect(disposed).toBe(true);
    });
});
