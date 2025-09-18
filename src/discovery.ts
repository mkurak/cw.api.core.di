import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface DiscoveryOptions {
    /** Root path to start discovery from. Defaults to process.cwd(). */
    rootDir?: string;
    /** List of directories or files (relative to rootDir) to include. Defaults to ['src']. */
    include?: string[];
    /** File extensions to attempt importing. Defaults to ['.js', '.ts', '.mjs', '.cjs']. */
    extensions?: string[];
    /** Whether to ignore files in node_modules directories. Defaults to true. */
    ignoreNodeModules?: boolean;
}

const DEFAULT_INCLUDE = ['src'];
const DEFAULT_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs'];

export async function discover(options: DiscoveryOptions = {}): Promise<void> {
    const rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
    const include = options.include ?? DEFAULT_INCLUDE;
    const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
    const ignoreNodeModules = options.ignoreNodeModules ?? true;

    const targets = include.map((entry) => path.resolve(rootDir, entry));

    for (const target of targets) {
        await importRecursively(target, extensions, ignoreNodeModules);
    }
}

async function importRecursively(
    targetPath: string,
    extensions: string[],
    ignoreNodeModules: boolean
): Promise<void> {
    if (!fs.existsSync(targetPath)) {
        return;
    }

    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
        if (ignoreNodeModules && path.basename(targetPath) === 'node_modules') {
            return;
        }
        const entries = fs.readdirSync(targetPath);
        for (const entry of entries) {
            await importRecursively(path.join(targetPath, entry), extensions, ignoreNodeModules);
        }
        return;
    }

    if (!extensions.includes(path.extname(targetPath))) {
        return;
    }

    const url = pathToFileURL(targetPath).href;
    await import(url);
}
