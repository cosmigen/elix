/**
 * ELIX Documents Spec Runner
 */
import { runDocumentsAdversarialTests } from './documents-adversarial.test.js';

runDocumentsAdversarialTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in ELIX Documents spec:', err);
    process.exit(1);
  });
