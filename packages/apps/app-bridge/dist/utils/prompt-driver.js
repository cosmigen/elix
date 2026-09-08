/**
 * Universal Prompt Driver with Persistent Readline Lifecycle & Input Queuing
 * Provides @clack/prompts compatibility in TTY and robust unified Node.js readline stream handling in piped/CI/non-TTY modes.
 */
import * as readline from 'node:readline';
let clack = null;
try {
    clack = await import('@clack/prompts');
}
catch {
    clack = null;
}
function shouldUseClack() {
    return Boolean(clack && process.stdin.isTTY && !process.env.CI);
}
const CANCEL_SYMBOL = Symbol('clack_cancel');
let sharedRl = null;
const lineQueue = [];
let pendingResolver = null;
export function getReadlineInterface() {
    if (!sharedRl || sharedRl.closed) {
        sharedRl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: Boolean(process.stdin.isTTY),
        });
        sharedRl.on('line', (line) => {
            if (pendingResolver) {
                const resolve = pendingResolver;
                pendingResolver = null;
                resolve(line);
            }
            else {
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
export function closeReadlineInterface() {
    if (sharedRl && !sharedRl.closed) {
        sharedRl.close();
        sharedRl = null;
    }
    lineQueue.length = 0;
    pendingResolver = null;
}
export function isCancel(value) {
    if (shouldUseClack() && typeof clack.isCancel === 'function') {
        return clack.isCancel(value);
    }
    return value === CANCEL_SYMBOL;
}
export function intro(title) {
    if (shouldUseClack())
        return clack.intro(title);
    console.log(`\n\x1b[36m┌─── ${title || 'ELIX OS'} ───\x1b[0m\n`);
}
export function outro(message) {
    if (shouldUseClack())
        return clack.outro(message);
    console.log(`\n\x1b[36m└─── ${message || 'Session ended'} ───\x1b[0m\n`);
}
export const log = {
    message: (msg) => {
        if (shouldUseClack())
            return clack.log.message(msg);
        console.log(`  \x1b[90m│\x1b[0m ${msg}`);
    },
    info: (msg) => {
        if (shouldUseClack())
            return clack.log.info(msg);
        console.log(`  \x1b[34mℹ\x1b[0m ${msg}`);
    },
    success: (msg) => {
        if (shouldUseClack())
            return clack.log.success(msg);
        console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
    },
    step: (msg) => {
        if (shouldUseClack())
            return clack.log.step(msg);
        console.log(`  \x1b[35m◆\x1b[0m ${msg}`);
    },
    warn: (msg) => {
        if (shouldUseClack())
            return clack.log.warn(msg);
        console.log(`  \x1b[33m▲\x1b[0m ${msg}`);
    },
    error: (msg) => {
        if (shouldUseClack())
            return clack.log.error(msg);
        console.error(`  \x1b[31m✖\x1b[0m ${msg}`);
    },
};
export function askQuestion(query) {
    if (typeof process.stdin.setRawMode === 'function') {
        try {
            process.stdin.setRawMode(false);
        }
        catch (_) { }
    }
    try {
        process.stdin.resume();
    }
    catch (_) { }
    getReadlineInterface();
    if (query) {
        process.stdout.write(query);
    }
    if (lineQueue.length > 0) {
        const nextLine = lineQueue.shift();
        return Promise.resolve(nextLine);
    }
    if (sharedRl?.closed) {
        return Promise.resolve('11');
    }
    return new Promise((resolve) => {
        pendingResolver = resolve;
    });
}
export async function confirm(opts) {
    if (shouldUseClack())
        return clack.confirm(opts);
    const defaultStr = opts.initialValue !== false ? 'Y/n' : 'y/N';
    const answer = await askQuestion(`\n? ${opts.message} (${defaultStr}): `);
    const trimmed = answer.trim().toLowerCase();
    if (!trimmed) {
        return opts.initialValue !== false;
    }
    else if (trimmed === 'y' || trimmed === 'yes') {
        return true;
    }
    else if (trimmed === 'n' || trimmed === 'no') {
        return false;
    }
    else {
        return opts.initialValue !== false;
    }
}
export async function select(opts) {
    if (shouldUseClack())
        return clack.select(opts);
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
            return opts.options[num - 1].value;
        }
        log.warn(`Invalid choice "${trimmed}". Please select a number between 1 and ${opts.options.length}.`);
    }
}
export async function text(opts) {
    if (shouldUseClack())
        return clack.text(opts);
    const defaultDisplay = opts.defaultValue || opts.initialValue ? ` [${opts.defaultValue || opts.initialValue}]` : '';
    while (true) {
        const answer = await askQuestion(`\n? ${opts.message}${defaultDisplay}: `);
        const finalVal = answer.trim() || opts.defaultValue || opts.initialValue || '';
        if (opts.validate) {
            const valRes = opts.validate(finalVal);
            if (typeof valRes === 'string') {
                log.warn(valRes);
                continue;
            }
            else if (valRes instanceof Error) {
                log.warn(valRes.message);
                continue;
            }
        }
        return finalVal;
    }
}
export function spinner() {
    if (shouldUseClack())
        return clack.spinner();
    return {
        start: (msg) => {
            if (msg)
                console.log(`  \x1b[36m⏳\x1b[0m ${msg}`);
        },
        stop: (msg) => {
            if (msg)
                console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
        },
        message: (msg) => {
            if (msg)
                console.log(`  \x1b[90m│\x1b[0m ${msg}`);
        },
    };
}
export function cancel(message) {
    if (shouldUseClack())
        return clack.cancel(message);
    console.log(`\n\x1b[31mCancelled: ${message || 'Operation cancelled'}\x1b[0m\n`);
}
//# sourceMappingURL=prompt-driver.js.map