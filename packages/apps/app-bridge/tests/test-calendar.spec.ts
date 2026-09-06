import { runCalendarAdversarialTests } from './calendar-adversarial.test.js';

runCalendarAdversarialTests().catch((err) => {
  console.error('Calendar test runner fatal error:', err);
  process.exit(1);
});
