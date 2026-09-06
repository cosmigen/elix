/**
 * ELIX Code (com.elix.code) Spec Test Runner
 */

import { runCodeAdversarialTests } from './code-adversarial.test.js';

(async () => {
  try {
    await runCodeAdversarialTests();
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
})();
