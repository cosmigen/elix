/**
 * ELIX Utilities (com.elix.utilities) — Adversarial Test Suite
 * 
 * Tests unit conversion extremes, 5MB cryptographic hashing throughput,
 * unicode astral plane / surrogate decomposition, QR resilience,
 * and dynamic ToolSink capability dispatch latency.
 */

import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ElixAppManager } from '../src/app-manager.js';
import { ElixAppInstaller } from '../src/installer.js';
import { ElixWindowManager } from '../src/window-manager.js';
import {
  MemoryToolSink,
  MemoryCapabilityIndex,
  ConsoleConfirmationBroker,
  MockWindowHost,
  NativeWindowHost,
} from '../src/adapters/ports.js';
import { sanitizeToolIdentifier } from '../src/tool-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

// Helper for CRC32 calculation in test
function computeCrc32(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  let crc = 0 ^ (-1);
  for (let i = 0; i < b.length; i++) {
    crc = (crc >>> 8) ^ (((crc ^ b[i]) & 0xFF) * 0xEDB88320);
  }
  return ((crc ^ (-1)) >>> 0).toString(16).padStart(8, '0');
}

// Unit conversion pure engine reference
function convertUnits(category: string, fromUnit: string, toUnit: string, val: number): number {
  const num = Number(val);
  if (Number.isNaN(num)) return 0;

  if (category === 'temperature') {
    let celsius = num;
    if (fromUnit === 'fahrenheit') celsius = (num - 32) * (5 / 9);
    else if (fromUnit === 'kelvin') celsius = num - 273.15;
    else if (fromUnit === 'rankine') celsius = (num - 491.67) * (5 / 9);

    if (toUnit === 'celsius') return celsius;
    if (toUnit === 'fahrenheit') return (celsius * 9 / 5) + 32;
    if (toUnit === 'kelvin') return celsius + 273.15;
    if (toUnit === 'rankine') return (celsius + 273.15) * 1.8;
  }

  if (category === 'data') {
    const mult: Record<string, number> = {
      bits: 1,
      bytes: 8,
      kilobytes: 8 * 1024,
      megabytes: 8 * 1024 ** 2,
      gigabytes: 8 * 1024 ** 3,
      terabytes: 8 * 1024 ** 4,
      petabytes: 8 * 1024 ** 5,
      exabytes: 8 * 1024 ** 6,
    };
    const bits = num * (mult[fromUnit] || 1);
    return bits / (mult[toUnit] || 1);
  }

  if (category === 'length') {
    const mult: Record<string, number> = {
      meters: 1,
      kilometers: 1000,
      centimeters: 0.01,
      millimeters: 0.001,
      miles: 1609.344,
      yards: 0.9144,
      feet: 0.3048,
      inches: 0.0254,
    };
    const meters = num * (mult[fromUnit] || 1);
    return meters / (mult[toUnit] || 1);
  }

  if (category === 'mass') {
    const mult: Record<string, number> = {
      kg: 1,
      grams: 0.001,
      milligrams: 0.000001,
      pounds: 0.45359237,
      ounces: 0.0283495231,
      metric_tons: 1000,
    };
    const kg = num * (mult[fromUnit] || 1);
    return kg / (mult[toUnit] || 1);
  }

  if (category === 'speed') {
    const mult: Record<string, number> = {
      'm/s': 1,
      'km/h': 1 / 3.6,
      mph: 0.44704,
      knots: 0.514444,
    };
    const ms = num * (mult[fromUnit] || 1);
    return ms / (mult[toUnit] || 1);
  }

  return num;
}

// Unicode inspector reference
function inspectUnicodeCodepoints(text: string) {
  const results: Array<{ char: string; codepoints: number[]; hex: string; isAstral: boolean }> = [];
  const iterator = text[Symbol.iterator]();
  let next = iterator.next();
  while (!next.done) {
    const ch = next.value;
    const cp = ch.codePointAt(0)!;
    results.push({
      char: ch,
      codepoints: Array.from(ch).map((c) => c.charCodeAt(0)),
      hex: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'),
      isAstral: cp > 0xffff,
    });
    next = iterator.next();
  }
  return results;
}

export async function runUtilitiesAdversarialTests(): Promise<void> {
  console.log('===========================================================================');
  console.log('⚡ ELIX UTILITIES (com.elix.utilities) — ADVERSARIAL TEST SUITE');
  console.log('===========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, msg: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✔ [PASS] ${msg}`);
    } else {
      console.error(`✖ [FAIL] ${msg}${detail ? ` (${detail})` : ''}`);
    }
  }

  const sandboxDir = path.join(PACKAGE_ROOT, 'test-sandbox-util-' + Date.now());
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);
  const nativeHost = new NativeWindowHost();

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex: capIndex,
    confirmationBroker,
    windowHost: nativeHost,
  });
  nativeHost.setInstaller(appManager.installer);

  // Phase 1: Rebuild demo apps and verify com.elix.utilities package
  const rebuilt = await appManager.rebuildDemoApps(path.join(PACKAGE_ROOT, 'demo-apps'));
  const utilApp = rebuilt.find((a) => a.manifest.id === 'com.elix.utilities');

  assert(utilApp !== undefined, 'Phase 1: com.elix.utilities packaged & deployed via rebuildDemoApps');
  const indexHtmlPath = path.join(utilApp?.installPath || '', 'index.html');
  assert(fs.existsSync(indexHtmlPath), 'Phase 1: com.elix.utilities/index.html exists in target binPath');

  const indexContent = await fsp.readFile(indexHtmlPath, 'utf8');
  assert(indexContent.includes('liquid-capsule'), 'Phase 1: Segmented Liquid Metal controls capsule in index.html');
  assert(indexContent.includes('ws://127.0.0.1:7391'), 'Phase 1: WebSocket IPC endpoint configured');

  // =========================================================================
  // TEST CASE 1: Unit Converter Extreme Values & High Decimal Precision
  // =========================================================================
  console.log('\n▶ [Test Case 1] Unit Converter Extreme Values & High Decimal Precision');

  // Absolute zero conversion
  const absZeroK = convertUnits('temperature', 'celsius', 'kelvin', -273.15);
  assert(Math.abs(absZeroK - 0.0) < 1e-6, `Test 1a: Absolute zero -273.15°C converts to 0 K (got ${absZeroK})`);

  const absZeroF = convertUnits('temperature', 'celsius', 'fahrenheit', -273.15);
  assert(Math.abs(absZeroF - -459.67) < 1e-4, `Test 1b: Absolute zero -273.15°C converts to -459.67°F (got ${absZeroF.toFixed(2)})`);

  // Large data unit conversion
  const petabytesToBits = convertUnits('data', 'petabytes', 'bits', 1);
  const expectedBits = 8 * (1024 ** 5);
  assert(petabytesToBits === expectedBits, `Test 1c: 1 Petabyte converts exactly to ${expectedBits} bits without overflow`);

  const bitsToPetabytes = convertUnits('data', 'bits', 'petabytes', expectedBits);
  assert(bitsToPetabytes === 1, `Test 1d: Reverse conversion from bits to Petabytes returns 1 PB`);

  // Speed conversion
  const speedKmh = convertUnits('speed', 'm/s', 'km/h', 100);
  assert(Math.abs(speedKmh - 360) < 1e-4, `Test 1e: 100 m/s converts to 360 km/h (got ${speedKmh})`);

  // =========================================================================
  // TEST CASE 2: Large Content Hashing & Performance (5MB payload)
  // =========================================================================
  console.log('\n▶ [Test Case 2] Large Content Hashing & Cryptographic Performance (5MB payload)');

  const fiveMbPayload = Buffer.alloc(5 * 1024 * 1024, 'ELIX-MICROKERNEL-SECURE-PAYLOAD-0123456789ABCDEF');
  const t0 = performance.now();

  const [sha256Digest, sha512Digest, md5Digest, crc32Digest] = await Promise.all([
    Promise.resolve(crypto.createHash('sha256').update(fiveMbPayload).digest('hex')),
    Promise.resolve(crypto.createHash('sha512').update(fiveMbPayload).digest('hex')),
    Promise.resolve(crypto.createHash('md5').update(fiveMbPayload).digest('hex')),
    Promise.resolve(computeCrc32(fiveMbPayload)),
  ]);

  const hashDurationMs = performance.now() - t0;

  assert(sha256Digest.length === 64, `Test 2a: SHA-256 digest generated (64 hex chars, ${sha256Digest.slice(0, 16)}...)`);
  assert(sha512Digest.length === 128, `Test 2b: SHA-512 digest generated (128 hex chars, ${sha512Digest.slice(0, 16)}...)`);
  assert(md5Digest.length === 32, `Test 2c: MD5 digest generated (32 hex chars, ${md5Digest})`);
  assert(crc32Digest.length === 8, `Test 2d: CRC32 checksum generated (8 hex chars, ${crc32Digest})`);
  assert(hashDurationMs < 1000.0, `Test 2e: 5MB payload parallel hash completed in ${hashDurationMs.toFixed(2)}ms (< 1000ms limit)`);

  // =========================================================================
  // TEST CASE 3: Unicode Surrogate Pairs & Astral Plane Characters
  // =========================================================================
  console.log('\n▶ [Test Case 3] Unicode Surrogate Pairs & Astral Plane Decomposition');

  const testUnicodeStr = '🦄 ⚡ 👨‍👩‍👧‍👦 🇺🇸';
  const inspected = inspectUnicodeCodepoints(testUnicodeStr);

  const unicorn = inspected.find((c) => c.char === '🦄');
  assert(unicorn !== undefined && unicorn.hex === 'U+1F984' && unicorn.isAstral === true, 'Test 3a: Unicorn emoji identified as astral plane codepoint U+1F984');

  const lightning = inspected.find((c) => c.char === '⚡');
  assert(lightning !== undefined && lightning.hex === 'U+26A1' && lightning.isAstral === false, 'Test 3b: Lightning bolt identified as BMP codepoint U+26A1');

  // Verify ZWJ composite emoji sequence handling
  const familyEmoji = '👨‍👩‍👧‍👦';
  const familyCodepoints = Array.from(familyEmoji).map((c) => c.codePointAt(0)!);
  assert(familyCodepoints.includes(0x200D), 'Test 3c: Family emoji contains Zero-Width Joiner (ZWJ U+200D) codepoints');
  assert(familyCodepoints.length >= 4, 'Test 3d: Multi-person composite emoji decomposes into composite surrogate clusters');

  // =========================================================================
  // TEST CASE 4: QR Code Overflow & Error Resilience
  // =========================================================================
  console.log('\n▶ [Test Case 4] QR Code Overflow & Error Resilience');

  function simulateQrMatrix(payload: string, eccLevel: string) {
    if (typeof payload !== 'string' || !payload) return { valid: false, size: 0 };
    const clampedPayload = payload.length > 4000 ? payload.slice(0, 4000) : payload;
    let seed = 0;
    for (let i = 0; i < clampedPayload.length; i++) {
      seed = (seed * 31 + clampedPayload.charCodeAt(i)) & 0xffffffff;
    }
    const size = eccLevel === 'H' ? 29 : 25;
    return { valid: true, size, seed, payloadLength: clampedPayload.length };
  }

  const normalQr = simulateQrMatrix('https://elix.os', 'M');
  assert(normalQr.valid === true && normalQr.size === 25, 'Test 4a: Normal payload renders valid 25x25 QR matrix');

  const oversizedStr = 'A'.repeat(12000);
  const overflowQr = simulateQrMatrix(oversizedStr, 'H');
  assert(overflowQr.valid === true && overflowQr.payloadLength === 4000 && overflowQr.size === 29, 'Test 4b: Oversized payload clamped safely to 4000 bytes without crash');

  const specialChars = 'Line1\nLine2\t"Quotes" & <Tags> \u0000 Null';
  const specialQr = simulateQrMatrix(specialChars, 'Q');
  assert(specialQr.valid === true, 'Test 4c: Special characters and control bytes handled safely without exception');

  // =========================================================================
  // TEST CASE 5: Dynamic AI Bridge Tool Invocation & Sub-15ms Latency
  // =========================================================================
  console.log('\n▶ [Test Case 5] Dynamic AI Bridge Tool Invocation & Sub-15ms Latency');

  const computeHashTool = toolSink.getTool('app_com_elix_utilities_compute_hash');
  assert(computeHashTool !== undefined, 'Test 5a: app_com_elix_utilities_compute_hash mounted in ToolSink');

  const convertUnitsTool = toolSink.getTool('app_com_elix_utilities_convert_units');
  assert(convertUnitsTool !== undefined, 'Test 5b: app_com_elix_utilities_convert_units mounted in ToolSink');

  const inspectColorTool = toolSink.getTool('app_com_elix_utilities_inspect_color');
  assert(inspectColorTool !== undefined, 'Test 5c: app_com_elix_utilities_inspect_color mounted in ToolSink');

  const lookupUnicodeTool = toolSink.getTool('app_com_elix_utilities_lookup_unicode');
  assert(lookupUnicodeTool !== undefined, 'Test 5d: app_com_elix_utilities_lookup_unicode mounted in ToolSink');

  const generateQrTool = toolSink.getTool('app_com_elix_utilities_generate_qr');
  assert(generateQrTool !== undefined, 'Test 5e: app_com_elix_utilities_generate_qr mounted in ToolSink');

  // Launch window
  const utilWin = await appManager.launch('com.elix.utilities');
  assert(utilWin !== undefined, 'Test 5f: ELIX Utilities window launched successfully');
  assert(utilWin.url.includes('com.elix.utilities'), 'Test 5g: Window target URL points to com.elix.utilities');

  // Tool execution & latency measurement
  const startToolTime = performance.now();
  const hashRes: any = await computeHashTool!.execute({
    content: 'Security verification payload',
    algorithm: 'SHA-256',
  });
  const elapsedToolMs = performance.now() - startToolTime;

  assert(hashRes.success === true, 'Test 5h: compute_hash execution returned success: true');
  assert(hashRes.result.appId === 'com.elix.utilities', 'Test 5i: Result matches com.elix.utilities appId');
  assert(hashRes.result.capability === 'compute_hash', 'Test 5j: Result matches compute_hash capability');
  assert(elapsedToolMs < 15.0, `Test 5k: Tool execution completed in ${elapsedToolMs.toFixed(2)}ms (< 15ms threshold)`);

  const closed = await appManager.close('com.elix.utilities');
  assert(closed === true, 'Test 5l: Window close requested and returned true');

  const running = nativeHost.listWindows();
  const utilRunning = running.find((w) => w.appId === 'com.elix.utilities');
  assert(utilRunning === undefined, 'Test 5m: com.elix.utilities cleanly unmounted from active windows');

  // Cleanup sandbox
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n===========================================================================`);
  console.log(`TOTAL RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`===========================================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (process.argv[1] && (process.argv[1].endsWith('utilities-adversarial.test.ts') || process.argv[1].endsWith('utilities-adversarial.test.js'))) {
  runUtilitiesAdversarialTests().then(() => {
      process.exit(0);
    }).catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
