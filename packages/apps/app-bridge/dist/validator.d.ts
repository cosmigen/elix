/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Strict Manifest Validation Engine for .ELIXAPP Manifests (elix.app.json)
 *
 * @module @deepseek-ai/elix-app-bridge/validator
 */
import type { ElixAppManifest, ManifestValidationResult } from './types.js';
/**
 * Validates an ELIX Application Manifest object (`elix.app.json`) against the `.ELIXAPP` specification.
 *
 * @param input Raw parsed JSON or object to validate
 * @returns Detailed validation result with errors, warnings, and normalized manifest if valid
 */
export declare function validateAppManifest(input: unknown): ManifestValidationResult<ElixAppManifest>;
/**
 * Normalizes an ELIX App Manifest by populating sensible defaults
 */
export declare function normalizeAppManifest(manifest: ElixAppManifest): ElixAppManifest;
/**
 * Type guard for checking if an unknown value is a valid ElixAppManifest
 */
export declare function isElixAppManifest(input: unknown): input is ElixAppManifest;
/**
 * Asserts that an unknown value conforms strictly to ElixAppManifest, throwing detailed error if not.
 */
export declare function assertValidAppManifest(input: unknown): asserts input is ElixAppManifest;
/**
 * Formats a validation report into human-readable text
 */
export declare function formatValidationReport(result: ManifestValidationResult): string;
//# sourceMappingURL=validator.d.ts.map