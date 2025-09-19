import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discover } from '../src/discovery';
import { resetContainer } from '../src/instance';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe('Discovery', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-di-discovery-'));

    beforeAll(() => {
        const tscBin = path.resolve(
            testDir,
            '..',
            'node_modules',
            '.bin',
            process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
        );
        childProcess.execFileSync(tscBin, ['--project', 'tsconfig.build.json'], {
            cwd: path.resolve(testDir, '..'),
            stdio: 'ignore'
        });
    });

    beforeEach(async () => {
        await resetContainer();
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('imports files and executes module body', async () => {
        const filePath = path.join(tempDir, 'sample.js');
        const content = `
            globalThis.__cwdi_discovery = (globalThis.__cwdi_discovery || []);
            globalThis.__cwdi_discovery.push('AutoEntity');
        `;
        fs.writeFileSync(filePath, content, 'utf8');

        await discover({
            rootDir: tempDir,
            include: ['.'],
            extensions: ['.js'],
            ignoreNodeModules: true
        });

        const registry = (globalThis as Record<string, unknown>).__cwdi_discovery as
            | string[]
            | undefined;
        expect(Array.isArray(registry)).toBe(true);
        expect(registry).toContain('AutoEntity');
        delete (globalThis as Record<string, unknown>).__cwdi_discovery;
    });
});
