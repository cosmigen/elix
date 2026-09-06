/**
 * Comprehensive Validation Test Suite for ELIX App Bridge Manifest Validator
 */

import {
  validateAppManifest,
  assertValidAppManifest,
  isElixAppManifest,
  formatValidationReport,
} from '../src/validator.js';
import type { ElixAppManifest } from '../src/types.js';

console.log('=== RUNNING ELIX MANIFEST VALIDATOR TEST SUITE ===\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (detail) console.error(`       Detail: ${detail}`);
  }
}

// 1. Valid Minimal Manifest
const validMinimal: ElixAppManifest = {
  id: 'calc-simple',
  name: 'Simple Calculator',
  version: '1.0.0',
  description: 'A clean and simple desktop calculator app',
  author: 'DeepSeek ELIX Team',
  entry: 'index.html',
};

const res1 = validateAppManifest(validMinimal);
assert(res1.valid === true, 'Test 1: Valid minimal manifest passes validation');
assert(res1.manifest?.window?.width === 800, 'Test 1b: Normalized defaults applied to window');
assert(isElixAppManifest(validMinimal) === true, 'Test 1c: isElixAppManifest typeguard returns true');

// 2. Valid Comprehensive Manifest with Capabilities and Window
const validFull: ElixAppManifest = {
  id: 'com.deepseek.sysmon',
  name: 'ELIX System Monitor',
  version: '2.1.0-beta.1',
  description: 'Real-time CPU, GPU, memory and process telemetry',
  author: {
    name: 'ELIX Core Systems',
    email: 'sys@elix.deepseek.ai',
    url: 'https://elix.deepseek.ai',
  },
  entry: 'dist/index.html',
  icon: 'assets/icon.png',
  window: {
    width: 1024,
    height: 768,
    minWidth: 640,
    minHeight: 480,
    resizable: true,
    alwaysOnTop: false,
    frame: true,
    transparent: false,
    center: true,
    backgroundColor: '#0f172a',
  },
  permissions: ['fs:read', 'os:info', 'net:http', 'agent:memory'],
  capabilities: {
    getProcessMetrics: {
      name: 'getProcessMetrics',
      description: 'Get current CPU and memory consumption for active system processes',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Top N processes to return',
            default: 10,
          },
        },
        required: [],
      },
      returns: {
        type: 'object',
        description: 'Process telemetry summary',
      },
      permissions: ['os:info'],
      timeoutMs: 5000,
    },
  },
  homepage: 'https://elix.deepseek.ai/apps/sysmon',
  categories: ['System', 'Utilities'],
  keywords: ['telemetry', 'monitor', 'cpu', 'memory'],
};

const res2 = validateAppManifest(validFull);
assert(res2.valid === true, 'Test 2: Comprehensive manifest with capabilities passes');
assert(res2.warnings.length === 0, 'Test 2b: Standard permissions produce 0 warnings');

// 3. Sensitive & Custom Permission Warning Check
const manifestWithPerms: ElixAppManifest = {
  ...validMinimal,
  id: 'root-terminal',
  permissions: ['os:exec', 'custom:plugin_action'],
};
const resPerms = validateAppManifest(manifestWithPerms);
assert(resPerms.valid === true, 'Test 3: Manifest with custom/sensitive permissions passes validation');
assert(
  resPerms.warnings.some((w) => w.code === 'HIGH_PRIVILEGE_PERMISSION'),
  'Test 3b: Sensitive permission (os:exec) triggers warning'
);
assert(
  resPerms.warnings.some((w) => w.code === 'UNKNOWN_PERMISSION'),
  'Test 3c: Custom permission triggers unknown permission warning'
);

// 4. Invalid App IDs
const invalidId1 = { ...validMinimal, id: 'INVALID_ID_CAPS' };
const resId1 = validateAppManifest(invalidId1);
assert(resId1.valid === false && resId1.errors.some((e) => e.path === 'id'), 'Test 4a: Uppercase ID fails');

const invalidId2 = { ...validMinimal, id: 'a' };
const resId2 = validateAppManifest(invalidId2);
assert(resId2.valid === false && resId2.errors.some((e) => e.code === 'INVALID_LENGTH'), 'Test 4b: Too short ID (<2 chars) fails');

// 5. Invalid SemVer
const invalidVersion = { ...validMinimal, version: '1.0' };
const resVer = validateAppManifest(invalidVersion);
assert(resVer.valid === false && resVer.errors.some((e) => e.code === 'INVALID_SEMVER'), 'Test 5: Non-SemVer version ("1.0") fails');

// 6. Directory Traversal / Absolute Path in Entry
const maliciousEntry1 = { ...validMinimal, entry: '../../../../etc/passwd' };
const resMal1 = validateAppManifest(maliciousEntry1);
assert(resMal1.valid === false && resMal1.errors.some((e) => e.code === 'INSECURE_PATH'), 'Test 6a: Directory traversal in entry fails');

const maliciousEntry2 = { ...validMinimal, entry: '/root/app.html' };
const resMal2 = validateAppManifest(maliciousEntry2);
assert(resMal2.valid === false && resMal2.errors.some((e) => e.code === 'INSECURE_PATH'), 'Test 6b: Absolute path in entry fails');

// 7. Invalid Entry Extension
const badExtension = { ...validMinimal, entry: 'app.exe' };
const resExt = validateAppManifest(badExtension);
assert(resExt.valid === false && resExt.errors.some((e) => e.code === 'INVALID_ENTRY_EXTENSION'), 'Test 7: Unsupported entry extension (.exe) fails');

// 8. Invalid Window Dimensions
const badWindow = {
  ...validMinimal,
  window: {
    width: 400,
    minWidth: 600, // width < minWidth
  },
};
const resWin = validateAppManifest(badWindow);
assert(resWin.valid === false && resWin.errors.some((e) => e.code === 'WINDOW_CONSTRAINT_VIOLATION'), 'Test 8: Window width < minWidth fails');

// 9. assertValidAppManifest throws on invalid and succeeds on valid
let threw = false;
try {
  assertValidAppManifest({ id: 'bad' });
} catch (e: any) {
  threw = true;
  assert(e.message.includes('ELIX App Manifest validation failed'), 'Test 9a: assertValidAppManifest throws descriptive error');
}
assert(threw, 'Test 9b: assertValidAppManifest successfully caught failure');

let assertPassed = false;
try {
  assertValidAppManifest(validMinimal);
  assertPassed = true;
} catch {
  assertPassed = false;
}
assert(assertPassed, 'Test 9c: assertValidAppManifest succeeds for valid manifest');

console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}
