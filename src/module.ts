import type { Container } from './container.js';
import type { InjectableOptions, InjectableClass, ResolveToken } from './types.js';

export interface ModuleProviderConfig {
    provide?: ResolveToken;
    useClass: InjectableClass;
    options?: InjectableOptions;
}

export type ModuleProvider = InjectableClass | ModuleProviderConfig;

export interface ModuleConfig {
    name?: string;
    imports?: ModuleRef[];
    providers?: ModuleProvider[];
    exports?: ResolveToken[];
}

export interface ModuleMetadata {
    imports: ModuleRef[];
    providers: ModuleProvider[];
    exports: ResolveToken[];
}

export interface ModuleRef {
    id: symbol;
    metadata: ModuleMetadata;
    configure(container: Container): void;
}

function normalizeProvider(provider: ModuleProvider): ModuleProviderConfig {
    if (typeof provider === 'function') {
        return { useClass: provider };
    }
    return provider;
}

export function createModule(config: ModuleConfig): ModuleRef {
    const metadata: ModuleMetadata = {
        imports: config.imports ?? [],
        providers: config.providers ?? [],
        exports: config.exports ?? []
    };

    const moduleRef: ModuleRef = {
        id: Symbol(config.name ?? 'module'),
        metadata,
        configure(container: Container) {
            for (const imported of metadata.imports) {
                container.registerModule(imported);
            }

            for (const provider of metadata.providers) {
                const normalized = normalizeProvider(provider);
                const { useClass, provide, options } = normalized;
                const opts: InjectableOptions = { ...(options ?? {}) };

                if (provide && typeof provide === 'string' && !opts.name) {
                    opts.name = provide;
                }

                container.register(useClass, opts);
            }
        }
    };

    return moduleRef;
}

export function registerModules(container: Container, ...modules: ModuleRef[]): void {
    for (const moduleRef of modules) {
        container.registerModule(moduleRef);
    }
}
