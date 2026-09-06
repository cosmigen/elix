/**
 * ELIX Center (com.elix.center) Spec Test Runner
 */

import { runCenterAdversarialTests } from './center-adversarial.test.js';

(async () => {
  try {
    await runCenterAdversarialTests();
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
})();
