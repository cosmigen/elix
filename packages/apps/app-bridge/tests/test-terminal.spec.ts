import { runTerminalAdversarialTests } from './terminal-adversarial.test.js';

(async () => {
  try {
    await runTerminalAdversarialTests();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error in ELIX Terminal spec:', err);
    process.exit(1);
  }
})();
