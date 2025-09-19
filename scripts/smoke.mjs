// scripts/smoke.mjs
import * as di from '../dist/index.js';

if (!di || typeof di.Container === 'undefined') {
  console.error('Smoke test failed: Container export missing');
  process.exit(1);
}
console.log('OK: smoke test passed');
