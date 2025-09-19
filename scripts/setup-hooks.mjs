#!/usr/bin/env node
import { execSync } from 'node:child_process';
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

function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

if (!isGitRepo()) {
  process.exit(0);
}

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
  logger.success('Git hooks path configured to .githooks');
} catch (error) {
  logger.warn('Failed to configure git hooks path', error);
}
