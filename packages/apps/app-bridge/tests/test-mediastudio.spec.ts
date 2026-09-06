/**
 * ELIX Media Studio Spec Runner
 */
import { runMediaStudioAdversarialTests } from './mediastudio-adversarial.test.js';

runMediaStudioAdversarialTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in ELIX Media Studio spec:', err);
    process.exit(1);
  });
