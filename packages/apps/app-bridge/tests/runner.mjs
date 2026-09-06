import { execSync } from 'child_process';
import path from 'path';

const tsxCli = 'C:\\Users\\S.LAKSHMI NARAYANA\\.gemini\\antigravity\\scratch\\elix-memory\\node_modules\\tsx\\dist\\cli.mjs';

const testFiles = [
  'tests/validator.test.ts',
  'tests/installer.test.ts',
  'tests/window-manager.test.ts',
  'tests/tool-registry.test.ts',
  'tests/app-manager.test.ts',
  'tests/demo-apps.test.ts',
  'tests/plugin.test.ts',
  'tests/fakeapp-e2e.test.ts',
  'tests/acceptance.test.ts',
  'tests/mock-window-host.test.ts',
  'tests/native-window-host.test.ts',
  'tests/local-ipc-server.test.ts',
  'tests/sys-exec-stream-adversarial.test.ts',
  'tests/deep-capabilities-adversarial.test.ts',
  'tests/notes-realtime-dom.test.ts',
  'tests/clock-adversarial.test.ts',
  'tests/calendar-adversarial.test.ts',
  'tests/test-calendar.spec.ts',
  'tests/utilities-adversarial.test.ts',
  'tests/test-utilities.spec.ts',
  'tests/files-adversarial.test.ts',
  'tests/test-files.spec.ts',
  'tests/media-adversarial.test.ts',
  'tests/test-media.spec.ts',
  'tests/mediastudio-adversarial.test.ts',
  'tests/test-mediastudio.spec.ts',
  'tests/studio3d-adversarial.test.ts',
  'tests/test-studio3d.spec.ts',
  'tests/documents-adversarial.test.ts',
  'tests/test-documents.spec.ts',
  'tests/capture-adversarial.test.ts',
  'tests/test-capture.spec.ts',
  'tests/camera-adversarial.test.ts',
  'tests/test-camera.spec.ts',
  'tests/terminal-adversarial.test.ts',
  'tests/test-terminal.spec.ts',
  'tests/code-adversarial.test.ts',
  'tests/test-code.spec.ts',
  'tests/sysmon-adversarial.test.ts',
  'tests/test-sysmon.spec.ts',
  'tests/devices-adversarial.test.ts',
  'tests/test-devices.spec.ts',
  'tests/settings-adversarial.test.ts',
  'tests/test-settings.spec.ts',
  'tests/appcenter-adversarial.test.ts',
  'tests/test-appcenter.spec.ts',
  'tests/search-adversarial.test.ts',
  'tests/test-search.spec.ts',
  'tests/center-adversarial.test.ts',
  'tests/test-center.spec.ts',
  'tests/tui-harness-adversarial.test.ts',
  'tests/test-tui-harness.spec.ts',
  'tests/path-quoting.test.ts',
  'tests/smoke-test.ts',
  'tests/e2e-all-options.test.ts',
  'src/test-all-options.ts'
];

console.log('===========================================================================');
console.log('🧪 ELIX APP BRIDGE — RUNNING ALL TEST SUITES');
console.log('===========================================================================\n');

let passed = 0;
let failed = 0;

process.env.HEADLESS = 'true';
process.env.CI = 'true';
process.env.ELIX_HEADLESS = 'true';

for (const file of testFiles) {
  process.stdout.write(`▶ Running: ${file} ... `);
  try {
    const output = execSync(`node "${tsxCli}" "${file}"`, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        HEADLESS: 'true',
        CI: 'true',
        ELIX_HEADLESS: 'true',
      },
    });
    console.log('✔ PASS');
    passed++;
  } catch (err) {
    console.log('✖ FAIL');
    console.error(err.stdout || err.stderr || err.message);
    failed++;
  }
}

console.log('\n===========================================================================');
console.log(`TOTAL TEST SUITES: ${passed} PASSED | ${failed} FAILED`);
console.log('===========================================================================\n');

if (failed > 0) {
  process.exit(1);
}
