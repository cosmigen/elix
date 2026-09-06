/**
 * ELIX Tool Definition Utilities and Cordis Adapter
 * 
 * @module @deepseek-ai/elix-app-bridge/utils/tools
 */

import type { CoreToolDefinition } from '@deepseek-ai/dsh-core-tools';

/**
 * Standard defineTool helper for Cordis AI tools
 */
export function defineTool<T = any, R = any>(def: CoreToolDefinition<T, R>): CoreToolDefinition<T, R> {
  return def;
}

export type { CoreToolDefinition };
