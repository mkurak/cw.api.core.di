import { Container } from './container';

const GLOBAL_KEY = Symbol.for('cw.api.core.di.container');

export function getContainer(): Container {
    const globalScope = globalThis as Record<PropertyKey, unknown>;
    if (!globalScope[GLOBAL_KEY]) {
        globalScope[GLOBAL_KEY] = new Container();
    }
    return globalScope[GLOBAL_KEY] as Container;
}

export function resetContainer(): void {
    const globalScope = globalThis as Record<PropertyKey, unknown>;
    if (globalScope[GLOBAL_KEY] instanceof Container) {
        (globalScope[GLOBAL_KEY] as Container).clear();
    }
}
