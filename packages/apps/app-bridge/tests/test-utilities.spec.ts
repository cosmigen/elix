/**
 * Test Spec Alias for ELIX Utilities Adversarial Suite
 */

import { runUtilitiesAdversarialTests } from './utilities-adversarial.test.js';

runUtilitiesAdversarialTests().catch((err) => {
  console.error('Utilities test spec fatal error:', err);
  process.exit(1);
});
