/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Capability Search Integration Hook (Port Adapter)
 *
 * @module @deepseek-ai/elix-app-bridge/capability-stub
 */
/**
 * Notifies the capability search indexer port/service if available.
 * If the indexer is absent, gracefully logs an archive trace without throwing errors.
 *
 * @param indexerOrCtx CapabilityIndex port instance or Microkernel Context
 * @param app Newly installed or registered application
 */
export function notifyCapabilitySearch(indexerOrCtx, app) {
    if (!indexerOrCtx) {
        return;
    }
    let indexer;
    if ('registerCapability' in indexerOrCtx && typeof indexerOrCtx.registerCapability === 'function') {
        indexer = indexerOrCtx;
    }
    else if ('capability_search' in indexerOrCtx && indexerOrCtx.capability_search) {
        indexer = indexerOrCtx.capability_search;
    }
    else if (typeof indexerOrCtx.get === 'function') {
        indexer = indexerOrCtx.get('capability_search');
    }
    const capabilities = app.manifest.capabilities || {};
    const capList = Array.isArray(capabilities) ? capabilities : Object.values(capabilities);
    if (indexer && typeof indexer.registerCapability === 'function') {
        for (const cap of capList) {
            const entry = {
                id: `app:${app.manifest.id}:${cap.name}`,
                name: cap.name,
                description: cap.description,
                kind: 'app_api',
                appId: app.manifest.id,
                parameters: cap.parameters,
                returns: cap.returns,
                permissions: cap.permissions || [],
                installedAt: app.installedAt,
            };
            try {
                indexer.registerCapability(entry);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[app-bridge:CAPABILITY_SEARCH] Failed to index capability '${entry.id}': ${msg}`);
            }
        }
    }
    else {
        // Graceful fallback logging
        console.log(`[app-bridge:ARCHIVE] Capability search service not found on context, skipping capability indexing for '${app.manifest.id}' (${capList.length} capabilities)`);
    }
}
/**
 * Removes an application's capabilities from the search indexer if available.
 *
 * @param indexerOrCtx CapabilityIndex port instance or Microkernel Context
 * @param appId Unique application ID
 */
export function removeCapabilitySearch(indexerOrCtx, appId) {
    if (!indexerOrCtx)
        return;
    let indexer;
    if ('unregisterOwner' in indexerOrCtx && typeof indexerOrCtx.unregisterOwner === 'function') {
        indexer = indexerOrCtx;
    }
    else if ('capability_search' in indexerOrCtx && indexerOrCtx.capability_search) {
        indexer = indexerOrCtx.capability_search;
    }
    else if (typeof indexerOrCtx.get === 'function') {
        indexer = indexerOrCtx.get('capability_search');
    }
    if (indexer) {
        try {
            if (typeof indexer.unregisterOwner === 'function') {
                indexer.unregisterOwner(appId);
            }
            else if (typeof indexer.unregisterByAppId === 'function') {
                indexer.unregisterByAppId(appId);
            }
        }
        catch {
            // Ignore unregister errors
        }
    }
}
//# sourceMappingURL=capability-stub.js.map