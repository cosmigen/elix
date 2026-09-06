/**
 * ELIX Universal Search (com.elix.search) Spec Test Runner
 */

import { runSearchAdversarialTests } from './search-adversarial.test.js';

(async () => {
  try {
    await runSearchAdversarialTests();
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
})();
