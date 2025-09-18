import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discover } from '../src/discovery';
import { getContainer, resetContainer } from '../src/instance';
import { ServiceType } from '../src/types';
import childProcess from 'node:child_process';

describe('Discovery', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-di-discovery-'));

    beforeAll(() => {
        const tscBin = path.resolve(
            __dirname,
            '..',
            'node_modules',
            '.bin',
            process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
        );
        childProcess.execFileSync(tscBin, ['--project', 'tsconfig.build.json'], {
            cwd: path.resolve(__dirname, '..'),
            stdio: 'ignore'
        });
    });

    beforeEach(() => {
        resetContainer();
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('imports files and registers decorated classes', async () => {
        const filePath = path.join(tempDir, 'sample.js');
        const content = `
            const { Injectable, ServiceType } = require('${path
                .resolve(__dirname, '../dist/index.js')
                .replace(/\\/g, '\\\\')}');
            class AutoEntity {}
            Injectable({ type: ServiceType.Entity })(AutoEntity);
            module.exports = AutoEntity;
        `;
        fs.writeFileSync(filePath, content, 'utf8');

        await discover({
            rootDir: tempDir,
            include: ['.'],
            extensions: ['.js'],
            ignoreNodeModules: true
        });

        const entities = getContainer().list(ServiceType.Entity);
        expect(entities.some((entry) => entry.token === 'AutoEntity')).toBe(true);
    });
});
