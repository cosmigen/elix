/**
 * ELIX System Monitor (com.elix.sysmon) Spec Test Runner
 */

import { runSysmonAdversarialTests } from './sysmon-adversarial.test.js';

(async () => {
  try {
    await runSysmonAdversarialTests();
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
})();
