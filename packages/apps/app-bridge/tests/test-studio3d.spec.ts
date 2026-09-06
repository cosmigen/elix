/**
 * ELIX 3D Studio Spec Runner
 */
import { runStudio3DAdversarialTests } from './studio3d-adversarial.test.js';

runStudio3DAdversarialTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in ELIX 3D Studio spec:', err);
    process.exit(1);
  });
