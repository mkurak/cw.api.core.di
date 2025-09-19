#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

const allowed = new Set([
    'major',
    'minor',
    'patch',
    'premajor',
    'preminor',
    'prepatch',
    'prerelease'
]);

const defaultMessage = 'chore: release v%s';

const [, , typeArg, ...messageParts] = process.argv;

if (!typeArg || !allowed.has(typeArg)) {
    console.error(
        `Usage: npm run release -- <${Array.from(allowed).join('|')}> [commit message]`
    );
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
    console.error(error.message);
    process.exit(1);
}
