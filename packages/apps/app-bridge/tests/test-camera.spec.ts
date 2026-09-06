/**
 * ELIX Camera Spec Runner
 */
import { runCameraAdversarialTests } from './camera-adversarial.test.js';

runCameraAdversarialTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in ELIX Camera spec:', err);
    process.exit(1);
  });
