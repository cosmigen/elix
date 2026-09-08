/**
 * Universal Prompt Driver with Persistent Readline Lifecycle & Input Queuing
 * Provides @clack/prompts compatibility in TTY and robust unified Node.js readline stream handling in piped/CI/non-TTY modes.
 */
import * as readline from 'node:readline';
export declare function getReadlineInterface(): readline.Interface;
export declare function closeReadlineInterface(): void;
export declare function isCancel(value: unknown): value is symbol;
export declare function intro(title?: string): void;
export declare function outro(message?: string): void;
export declare const log: {
    message: (msg: string) => any;
    info: (msg: string) => any;
    success: (msg: string) => any;
    step: (msg: string) => any;
    warn: (msg: string) => any;
    error: (msg: string) => any;
};
export declare function askQuestion(query: string): Promise<string>;
export declare function confirm(opts: {
    message: string;
    initialValue?: boolean;
}): Promise<boolean | symbol>;
export declare function select<T = string>(opts: {
    message: string;
    options: Array<{
        value: T;
        label?: string;
        hint?: string;
    }>;
    initialValue?: T;
}): Promise<T | symbol>;
export declare function text(opts: {
    message: string;
    placeholder?: string;
    defaultValue?: string;
    initialValue?: string;
    validate?: (value: string) => string | Error | void;
}): Promise<string | symbol>;
export declare function spinner(): {
    start(msg?: string): void;
    stop(msg?: string, code?: number): void;
    message(msg?: string): void;
};
export declare function cancel(message?: string): void;
//# sourceMappingURL=prompt-driver.d.ts.map