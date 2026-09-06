/**
 * ELIX App Center (com.elix.appcenter) Spec Test Runner
 */

import { runAppCenterAdversarialTests } from './appcenter-adversarial.test.js';

(async () => {
  try {
    await runAppCenterAdversarialTests();
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
})();
