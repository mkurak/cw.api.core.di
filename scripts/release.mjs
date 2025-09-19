#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createColoredConsole } from 'cw.helper.colored.console';

const logger = createColoredConsole({
    name: 'cw-di',
    theme: {
        info: { color: 'cyan' },
        success: { color: 'green' },
        warn: { color: 'yellow', bold: true },
        error: { color: 'red', bold: true },
        debug: { color: 'magenta', dim: true }
    }
});

function run(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

const allowedTypes = [
    'major',
    'minor',
    'patch',
    'premajor',
    'preminor',
    'prepatch',
    'prerelease'
];
const allowed = new Set(allowedTypes);

const helpText = `Release helper\n\nUsage:\n  npm run release -- <type> [commit message]\n  npm run release --patch\n  npm run release -- patch \"custom message\"\n  npm run release patch\n  node scripts/release.mjs patch \"custom message\"\n\nTypes:\n  ${allowedTypes.join(', ')}\n\nNotlar:\n  - Mesaj vermezsen otomatik olarak \"chore: release v%s\" formatı kullanılır.\n  - Mesaj yazıp \"%s\" eklemezsen, sürüm numarası sona eklenir.\n  - Komut, sürümü artırdıktan sonra otomatik olarak \"git push\" ve \"git push --tags\" çalıştırır.`;

const defaultMessage = 'chore: release v%s';

const args = process.argv.slice(2);

if (args[0] === '--') {
    args.shift();
}

function normalizeType(value) {
    if (!value) return undefined;
    if (value === '--') return undefined;
    if (value.startsWith('--')) return value.slice(2);
    if (value.startsWith('-')) return value.slice(1);
    return value;
}

function detectTypeFromEnv() {
    for (const type of allowedTypes) {
        const envValue = process.env[`npm_config_${type}`];
        if (typeof envValue !== 'undefined') {
            if (envValue === '' || envValue === 'true') {
                return type;
            }
        }
    }
    return undefined;
}

let potentialType = normalizeType(args[0]);

if (potentialType && ['help', 'h', '?'].includes(potentialType)) {
    logger.info(helpText);
    process.exit(0);
}

let messageParts;
if (potentialType && allowed.has(potentialType)) {
    messageParts = args.slice(1);
} else {
    potentialType = detectTypeFromEnv();
    messageParts = args;
}

const typeArg = potentialType;

if (!typeArg || !allowed.has(typeArg)) {
    logger.error(helpText);
    process.exit(1);
}

const rawMessage = messageParts.join(' ').trim();
const commitMessage = rawMessage.length > 0 ? rawMessage : defaultMessage;
const finalMessage = commitMessage.includes('%s') ? commitMessage : `${commitMessage} %s`;

try {
    run('npm', ['version', typeArg, '-m', finalMessage]);
    run('git', ['push']);
    run('git', ['push', '--tags']);
} catch (error) {
    logger.error('Release failed', error);
    process.exit(1);
}
