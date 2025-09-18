import { Container } from './container';

const GLOBAL_KEY = Symbol.for('cw.api.core.di.container');

export function getContainer(): Container {
    const globalScope = globalThis as Record<PropertyKey, unknown>;
    if (!globalScope[GLOBAL_KEY]) {
        globalScope[GLOBAL_KEY] = new Container();
    }
    return globalScope[GLOBAL_KEY] as Container;
}

export function resetContainer(): Promise<void> | void {
    const globalScope = globalThis as Record<PropertyKey, unknown>;
    const existing = globalScope[GLOBAL_KEY];
    if (existing instanceof Container) {
        const result = existing.clear();
        if (result && typeof (result as PromiseLike<void>).then === 'function') {
            return result;
        }
    }
}
