/**
 * ELIX Media Spec Runner
 */
import { runMediaAdversarialTests } from './media-adversarial.test.js';

runMediaAdversarialTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in ELIX Media spec:', err);
    process.exit(1);
  });
