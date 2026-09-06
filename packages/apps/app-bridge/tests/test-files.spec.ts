/**
 * ELIX Files Spec Runner
 */
import { runFilesAdversarialTests } from './files-adversarial.test.js';

runFilesAdversarialTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in ELIX Files spec:', err);
    process.exit(1);
  });
