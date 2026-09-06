/**
 * Universal Prompt Driver with Persistent Readline Lifecycle & Input Queuing
 * Provides @clack/prompts compatibility in TTY and robust unified Node.js readline stream handling in piped/CI/non-TTY modes.
 */

import * as readline from 'node:readline';

let clack: any = null;
try {
  clack = await import('@clack/prompts');
} catch {
  clack = null;
}

function shouldUseClack(): boolean {
  return Boolean(clack && process.stdin.isTTY && !process.env.CI);
}

const CANCEL_SYMBOL = Symbol('clack_cancel');

let sharedRl: readline.Interface | null = null;
const lineQueue: string[] = [];
let pendingResolver: ((line: string) => void) | null = null;

export function getReadlineInterface(): readline.Interface {
  if (!sharedRl || (sharedRl as any).closed) {
    sharedRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    sharedRl.on('line', (line: string) => {
      if (pendingResolver) {
        const resolve = pendingResolver;
        pendingResolver = null;
        resolve(line);
      } else {
        lineQueue.push(line);
      }
    });

    sharedRl.on('close', () => {
      if (pendingResolver) {
        const resolve = pendingResolver;
        pendingResolver = null;
        resolve(lineQueue.shift() || '11');
      }
    });
  }
  return sharedRl;
}

export function closeReadlineInterface(): void {
  if (sharedRl && !(sharedRl as any).closed) {
    sharedRl.close();
    sharedRl = null;
  }
  lineQueue.length = 0;
  pendingResolver = null;
}

export function isCancel(value: unknown): value is symbol {
  if (shouldUseClack() && typeof clack.isCancel === 'function') {
    return clack.isCancel(value);
  }
  return value === CANCEL_SYMBOL;
}

export function intro(title?: string): void {
  if (shouldUseClack()) return clack.intro(title);
  console.log(`\n\x1b[36m┌─── ${title || 'ELIX OS'} ───\x1b[0m\n`);
}

export function outro(message?: string): void {
  if (shouldUseClack()) return clack.outro(message);
  console.log(`\n\x1b[36m└─── ${message || 'Session ended'} ───\x1b[0m\n`);
}

export const log = {
  message: (msg: string) => {
    if (shouldUseClack()) return clack.log.message(msg);
    console.log(`  \x1b[90m│\x1b[0m ${msg}`);
  },
  info: (msg: string) => {
    if (shouldUseClack()) return clack.log.info(msg);
    console.log(`  \x1b[34mℹ\x1b[0m ${msg}`);
  },
  success: (msg: string) => {
    if (shouldUseClack()) return clack.log.success(msg);
    console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
  },
  step: (msg: string) => {
    if (shouldUseClack()) return clack.log.step(msg);
    console.log(`  \x1b[35m◆\x1b[0m ${msg}`);
  },
  warn: (msg: string) => {
    if (shouldUseClack()) return clack.log.warn(msg);
    console.log(`  \x1b[33m▲\x1b[0m ${msg}`);
  },
  error: (msg: string) => {
    if (shouldUseClack()) return clack.log.error(msg);
    console.error(`  \x1b[31m✖\x1b[0m ${msg}`);
  },
};

export function askQuestion(query: string): Promise<string> {
  getReadlineInterface();
  if (query) {
    process.stdout.write(query);
  }
  if (lineQueue.length > 0) {
    const nextLine = lineQueue.shift()!;
    return Promise.resolve(nextLine);
  }
  if ((sharedRl as any)?.closed) {
    return Promise.resolve('11');
  }
  return new Promise((resolve) => {
    pendingResolver = resolve;
  });
}

export async function confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean | symbol> {
  if (shouldUseClack()) return clack.confirm(opts);
  const defaultStr = opts.initialValue !== false ? 'Y/n' : 'y/N';
  const answer = await askQuestion(`\n? ${opts.message} (${defaultStr}): `);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) {
    return opts.initialValue !== false;
  } else if (trimmed === 'y' || trimmed === 'yes') {
    return true;
  } else if (trimmed === 'n' || trimmed === 'no') {
    return false;
  } else {
    return opts.initialValue !== false;
  }
}

export async function select<T = string>(opts: {
  message: string;
  options: Array<{ value: T; label?: string; hint?: string }>;
  initialValue?: T;
}): Promise<T | symbol> {
  if (shouldUseClack()) return clack.select(opts);
  console.log(`\n? ${opts.message}`);
  opts.options.forEach((opt, idx) => {
    const label = opt.label || String(opt.value);
    const hint = opt.hint ? ` \x1b[90m(${opt.hint})\x1b[0m` : '';
    console.log(`  [${idx + 1}] ${label}${hint}`);
  });

  while (true) {
    const answer = await askQuestion(`Select option (1-${opts.options.length}): `);
    const trimmed = answer.trim();
    if (!trimmed) {
      log.warn('Please enter a valid option number.');
      continue;
    }
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= opts.options.length) {
      return opts.options[num - 1]!.value;
    }
    log.warn(`Invalid choice "${trimmed}". Please select a number between 1 and ${opts.options.length}.`);
  }
}

export async function text(opts: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  validate?: (value: string) => string | Error | void;
}): Promise<string | symbol> {
  if (shouldUseClack()) return clack.text(opts);
  const defaultDisplay = opts.defaultValue || opts.initialValue ? ` [${opts.defaultValue || opts.initialValue}]` : '';

  while (true) {
    const answer = await askQuestion(`\n? ${opts.message}${defaultDisplay}: `);
    const finalVal = answer.trim() || opts.defaultValue || opts.initialValue || '';
    if (opts.validate) {
      const valRes = opts.validate(finalVal);
      if (typeof valRes === 'string') {
        log.warn(valRes);
        continue;
      } else if (valRes instanceof Error) {
        log.warn(valRes.message);
        continue;
      }
    }
    return finalVal;
  }
}

export function spinner(): {
  start(msg?: string): void;
  stop(msg?: string, code?: number): void;
  message(msg?: string): void;
} {
  if (shouldUseClack()) return clack.spinner();
  return {
    start: (msg?: string) => {
      if (msg) console.log(`  \x1b[36m⏳\x1b[0m ${msg}`);
    },
    stop: (msg?: string) => {
      if (msg) console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
    },
    message: (msg?: string) => {
      if (msg) console.log(`  \x1b[90m│\x1b[0m ${msg}`);
    },
  };
}

export function cancel(message?: string): void {
  if (shouldUseClack()) return clack.cancel(message);
  console.log(`\n\x1b[31mCancelled: ${message || 'Operation cancelled'}\x1b[0m\n`);
}
