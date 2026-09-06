/**
 * Ambient type declarations for ELIX OS Microkernel ecosystem
 */

/// <reference types="node" />

declare module 'nanoid' {
  export function nanoid(size?: number): string;
}

declare module 'adm-zip' {
  export interface IZipEntry {
    entryName: string;
    name: string;
    isDirectory: boolean;
    getData(): Buffer;
    [key: string]: any;
  }

  export default class AdmZip {
    constructor(fileNameOrRawData?: string | Buffer);
    getEntries(): IZipEntry[];
    getEntry(name: string): IZipEntry | null;
    readAsText(name: string | IZipEntry, encoding?: string): string;
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    extractEntryTo(entry: string | IZipEntry, targetPath: string, maintainEntryPath?: boolean, overwrite?: boolean): boolean;
    addFile(entryName: string, data: Buffer, comment?: string, attr?: number): void;
    addLocalFile(localPath: string, zipPath?: string, zipName?: string): void;
    addLocalFolder(localPath: string, zipPath?: string): void;
    toBuffer(): Buffer;
    writeZip(targetFileName?: string): void;
  }
}

declare module '@clack/prompts' {
  export function intro(title?: string): void;
  export function outro(message?: string): void;
  export const log: {
    message(msg: string): void;
    info(msg: string): void;
    success(msg: string): void;
    step(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
  export function confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean | symbol>;
  export function select<T = string>(opts: {
    message: string;
    options: Array<{ value: T; label?: string; hint?: string }>;
    initialValue?: T;
  }): Promise<T | symbol>;
  export function text(opts: {
    message: string;
    placeholder?: string;
    defaultValue?: string;
    initialValue?: string;
    validate?: (value: string) => string | Error | void;
  }): Promise<string | symbol>;
  export function spinner(): {
    start(msg?: string): void;
    stop(msg?: string, code?: number): void;
    message(msg?: string): void;
  };
  export function isCancel(value: unknown): value is symbol;
  export function cancel(message?: string): void;
}

declare module '@deepseek-ai/schemastery' {
  export interface Schema<T = any> {
    (data?: any): T;
    type?: string;
    default(value: T): this;
    description(text: string): this;
    pattern(regex: RegExp): this;
    required(): this;
    [key: string]: any;
  }

  export namespace Schema {
    export function string(): Schema<string>;
    export function number(): Schema<number>;
    export function boolean(): Schema<boolean>;
    export function array<T>(inner: Schema<T>): Schema<T[]>;
    export function dict<T>(inner: Schema<T>): Schema<Record<string, T>>;
    export function object<T extends object>(dict: { [K in keyof T]?: Schema<T[K]> }): Schema<T>;
    export function union<T>(schemas: Schema<any>[]): Schema<T>;
    export function intersect<T>(schemas: Schema<any>[]): Schema<T>;
    export function any(): Schema<any>;
    export function const_<T>(value: T): Schema<T>;
    export { const_ as const };
  }

  export const Schema: {
    string(): Schema<string>;
    number(): Schema<number>;
    boolean(): Schema<boolean>;
    array<T>(inner: Schema<T>): Schema<T[]>;
    dict<T>(inner: Schema<T>): Schema<Record<string, T>>;
    object<T extends object>(dict: { [K in keyof T]?: Schema<T[K]> }): Schema<T>;
    union<T>(schemas: Schema<any>[]): Schema<T>;
    intersect<T>(schemas: Schema<any>[]): Schema<T>;
    any(): Schema<any>;
    const: <T>(value: T) => Schema<T>;
  };

  export default Schema;
}

declare module '@deepseek-ai/cordis' {
  export interface ToolService {
    register(tool: any): () => void;
    unregister?(name: string): void;
    get?(name: string): any;
    list?(): any[];
    [key: string]: any;
  }

  export class Context {
    tools: ToolService;
    plugin(plugin: any, config?: any): any;
    on(event: string, listener: (...args: any[]) => any): () => void;
    emit(event: string, ...args: any[]): void;
    [key: string]: any;
  }

  export abstract class Service {
    constructor(ctx: Context, name: string, immediate?: boolean);
    protected ctx: Context;
  }
}

declare module 'cordis' {
  export interface ToolService {
    register(tool: any): () => void;
    unregister?(name: string): void;
    get?(name: string): any;
    list?(): any[];
    [key: string]: any;
  }

  export class Context {
    tools: ToolService;
    plugin(plugin: any, config?: any): any;
    on(event: string, listener: (...args: any[]) => any): () => void;
    emit(event: string, ...args: any[]): void;
    [key: string]: any;
  }

  export abstract class Service {
    constructor(ctx: Context, name: string, immediate?: boolean);
    protected ctx: Context;
  }
}

declare module '@deepseek-ai/dsh-core-tools' {
  export interface CoreToolDefinition<T = any, R = any> {
    name: string;
    description: string;
    parameters: any;
    execute(args: T, context?: any): Promise<R> | R;
    [key: string]: any;
  }

  export type ToolDefinition<T = any, R = any> = CoreToolDefinition<T, R>;

  export function defineTool<T = any, R = any>(def: CoreToolDefinition<T, R>): CoreToolDefinition<T, R>;
}

declare module 'systeminformation' {
  export function networkInterfaces(): Promise<any[]>;
  export function graphics(): Promise<any>;
  export function audio(): Promise<any[]>;
  export function system(): Promise<any>;
  export function cpu(): Promise<any>;
  export function mem(): Promise<any>;
  export function osInfo(): Promise<any>;
  export const si: any;
  export default si;
}

declare module 'xlsx' {
  export const readFile: (filename: string, opts?: any) => any;
  export const read: (data: any, opts?: any) => any;
  export const write: (data: any, opts?: any) => any;
  export const writeFile: (wb: any, filename: string, opts?: any) => void;
  export const utils: any;
  export default { readFile, read, write, writeFile, utils };
}

declare module 'hyperformula' {
  export class HyperFormula {
    static buildFromSheets(sheets: Record<string, any[][]>, config?: any): HyperFormula;
    static buildEmpty(config?: any): HyperFormula;
    getCellValue(address: any): any;
    setCellContents(address: any, formulaOrValue: any): void;
    [key: string]: any;
  }
  export default HyperFormula;
}

declare module 'pdfjs-dist' {
  export const getDocument: (src: any) => any;
  export const GlobalWorkerOptions: any;
  export default { getDocument, GlobalWorkerOptions };
}

declare module 'mammoth' {
  export function convertToHtml(input: any, options?: any): Promise<{ value: string; messages: any[] }>;
  export function extractRawText(input: any): Promise<{ value: string; messages: any[] }>;
  export default { convertToHtml, extractRawText };
}
