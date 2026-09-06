/**
 * ELIX TUI Harness Spec Test Runner
 */

import { runTuiHarnessAdversarialTests } from './tui-harness-adversarial.test.js';

(async () => {
  try {
    await runTuiHarnessAdversarialTests();
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
})();
