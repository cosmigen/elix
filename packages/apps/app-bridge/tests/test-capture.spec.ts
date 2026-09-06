/**
 * ELIX Capture Spec Runner
 */
import { runCaptureAdversarialTests } from './capture-adversarial.test.js';

runCaptureAdversarialTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in ELIX Capture spec:', err);
    process.exit(1);
  });
