#!/usr/bin/env node
import { createColoredConsole } from 'cw.helper.colored.console';
import * as di from '../dist/index.js';

const logger = createColoredConsole({
  name: 'cw.api.core.di',
  enabled: true
});

function fail(message, error) {
  logger.error('Smoke test failed:', message);
  if (error) {
    logger.error(error);
  }
  process.exit(1);
}

try {
  if (!di || typeof di.Container !== 'function') {
    fail('Container export missing');
  }

  class ValueService {
    constructor() {
      this.value = 42;
    }
  }

  const container = new di.Container();
  container.register(ValueService);
  const resolved = container.resolve(ValueService);
  if (!resolved || resolved.value !== 42) {
    fail('Container resolve returned unexpected value');
  }

  logger.info('OK: smoke test passed');
} catch (error) {
  fail('unexpected error', error);
}
