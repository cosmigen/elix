/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Capability Search Integration Hook (Port Adapter)
 *
 * @module @deepseek-ai/elix-app-bridge/capability-stub
 */
import type { CapabilityIndex, CapabilityEntry } from './adapters/ports.js';
import type { InstalledApp } from './types.js';
export type { CapabilityEntry };
/**
 * Notifies the capability search indexer port/service if available.
 * If the indexer is absent, gracefully logs an archive trace without throwing errors.
 *
 * @param indexerOrCtx CapabilityIndex port instance or Microkernel Context
 * @param app Newly installed or registered application
 */
export declare function notifyCapabilitySearch(indexerOrCtx: CapabilityIndex | {
    capability_search?: CapabilityIndex;
    [key: string]: any;
} | undefined, app: InstalledApp): void;
/**
 * Removes an application's capabilities from the search indexer if available.
 *
 * @param indexerOrCtx CapabilityIndex port instance or Microkernel Context
 * @param appId Unique application ID
 */
export declare function removeCapabilitySearch(indexerOrCtx: CapabilityIndex | {
    capability_search?: CapabilityIndex;
    [key: string]: any;
} | undefined, appId: string): void;
//# sourceMappingURL=capability-stub.d.ts.map