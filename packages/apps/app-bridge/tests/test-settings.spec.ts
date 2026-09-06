/**
 * ELIX Settings (com.elix.settings) Spec Test Runner
 */

import { runSettingsAdversarialTests } from './settings-adversarial.test.js';

(async () => {
  try {
    await runSettingsAdversarialTests();
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
})();
