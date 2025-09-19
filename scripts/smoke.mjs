// scripts/smoke.mjs
import { createColoredConsole } from 'cw.helper.colored.console';
import * as di from '../dist/index.js';

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

if (!di || typeof di.Container === 'undefined') {
  logger.error('Smoke test failed: Container export missing');
  process.exit(1);
}

logger.success('OK: smoke test passed');
