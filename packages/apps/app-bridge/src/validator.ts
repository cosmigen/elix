/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Strict Manifest Validation Engine for .ELIXAPP Manifests (elix.app.json)
 * 
 * @module @deepseek-ai/elix-app-bridge/validator
 */

import type {
  ElixAppAuthor,
  ElixAppManifest,
  ElixAppPermission,
  ElixAppWindowConfig,
  ManifestValidationResult,
  ValidationIssue,
} from './types.js';

/** Regex for strict App ID validation */
const APP_ID_REGEX = /^[a-z0-9]+([.-][a-z0-9]+)*$/;

/** Regex for strict SemVer (SemVer 2.0.0 compliant) */
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Regex for permission descriptors in namespace:action syntax */
const PERMISSION_REGEX = /^[a-z0-9_-]+:[a-z0-9_*.-]+$/;

/** Regex for capability identifiers */
const CAPABILITY_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

/** Allowed entry file extensions */
const VALID_ENTRY_EXTENSIONS = ['.html', '.htm', '.js', '.mjs', '.ts', '.xhtml'];

/** Allowed icon file extensions */
const VALID_ICON_EXTENSIONS = ['.png', '.svg', '.webp', '.ico', '.jpg', '.jpeg', '.gif'];

/** Known standard ELIX OS permissions */
const KNOWN_PERMISSIONS = new Set<string>([
  'fs:read',
  'fs:write',
  'fs:all',
  'net:http',
  'net:ws',
  'net:all',
  'os:exec',
  'os:env',
  'os:info',
  'agent:memory',
  'agent:tools',
  'agent:llm',
  'ui:notification',
  'ui:dialog',
  'ui:tray',
  'clipboard:read',
  'clipboard:write',
  'system:power',
]);

/** High-risk permissions that trigger warnings during validation */
const SENSITIVE_PERMISSIONS = new Set<string>([
  'fs:all',
  'net:all',
  'os:exec',
  'os:env',
]);

/**
 * Validates an ELIX Application Manifest object (`elix.app.json`) against the `.ELIXAPP` specification.
 * 
 * @param input Raw parsed JSON or object to validate
 * @returns Detailed validation result with errors, warnings, and normalized manifest if valid
 */
export function validateAppManifest(input: unknown): ManifestValidationResult<ElixAppManifest> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: [
        {
          path: '',
          message: 'Manifest root must be a non-null JSON object',
          severity: 'error',
          code: 'INVALID_ROOT_TYPE',
        },
      ],
      warnings: [],
    };
  }

  const raw = input as Record<string, unknown>;

  // 1. Validate 'id' (Required)
  if (typeof raw['id'] !== 'string' || !raw['id'].trim()) {
    errors.push({
      path: 'id',
      message: "Field 'id' is required and must be a non-empty string",
      severity: 'error',
      code: 'REQUIRED_FIELD_MISSING',
    });
  } else {
    const id = raw['id'].trim();
    if (id.length < 2 || id.length > 128) {
      errors.push({
        path: 'id',
        message: "Field 'id' must be between 2 and 128 characters in length",
        severity: 'error',
        code: 'INVALID_LENGTH',
      });
    } else if (!APP_ID_REGEX.test(id)) {
      errors.push({
        path: 'id',
        message: "Field 'id' must consist of lowercase alphanumeric segments separated by single dots or hyphens (e.g., 'com.deepseek.calc' or 'sys-calc')",
        severity: 'error',
        code: 'INVALID_FORMAT',
      });
    }
  }

  // 2. Validate 'name' (Required)
  if (typeof raw['name'] !== 'string' || !raw['name'].trim()) {
    errors.push({
      path: 'name',
      message: "Field 'name' is required and must be a non-empty string",
      severity: 'error',
      code: 'REQUIRED_FIELD_MISSING',
    });
  } else if (raw['name'].trim().length > 100) {
    errors.push({
      path: 'name',
      message: "Field 'name' must not exceed 100 characters",
      severity: 'error',
      code: 'INVALID_LENGTH',
    });
  }

  // 3. Validate 'version' (Required, SemVer)
  if (typeof raw['version'] !== 'string' || !raw['version'].trim()) {
    errors.push({
      path: 'version',
      message: "Field 'version' is required and must be a non-empty string",
      severity: 'error',
      code: 'REQUIRED_FIELD_MISSING',
    });
  } else {
    const version = raw['version'].trim();
    if (!SEMVER_REGEX.test(version)) {
      errors.push({
        path: 'version',
        message: `Field 'version' must be a valid SemVer string (e.g. '1.0.0', '0.1.0-beta.1'), got '${version}'`,
        severity: 'error',
        code: 'INVALID_SEMVER',
      });
    }
  }

  // 4. Validate 'description' (Required)
  if (typeof raw['description'] !== 'string' || !raw['description'].trim()) {
    errors.push({
      path: 'description',
      message: "Field 'description' is required and must be a non-empty string",
      severity: 'error',
      code: 'REQUIRED_FIELD_MISSING',
    });
  }

  // 5. Validate 'author' (Required)
  if (!raw['author']) {
    errors.push({
      path: 'author',
      message: "Field 'author' is required (string or author object)",
      severity: 'error',
      code: 'REQUIRED_FIELD_MISSING',
    });
  } else if (typeof raw['author'] === 'string') {
    if (!raw['author'].trim()) {
      errors.push({
        path: 'author',
        message: "Field 'author' string must not be empty",
        severity: 'error',
        code: 'INVALID_AUTHOR',
      });
    }
  } else if (typeof raw['author'] === 'object' && !Array.isArray(raw['author'])) {
    const authorObj = raw['author'] as Record<string, unknown>;
    if (typeof authorObj['name'] !== 'string' || !authorObj['name'].trim()) {
      errors.push({
        path: 'author.name',
        message: "Author object must include a non-empty 'name' string",
        severity: 'error',
        code: 'INVALID_AUTHOR',
      });
    }
    if (authorObj['email'] !== undefined && (typeof authorObj['email'] !== 'string' || !authorObj['email'].includes('@'))) {
      errors.push({
        path: 'author.email',
        message: "Author email must be a valid email address",
        severity: 'error',
        code: 'INVALID_EMAIL',
      });
    }
    if (authorObj['url'] !== undefined && (typeof authorObj['url'] !== 'string' || !isValidUrl(authorObj['url']))) {
      errors.push({
        path: 'author.url',
        message: "Author URL must be a valid HTTP/HTTPS URL",
        severity: 'error',
        code: 'INVALID_URL',
      });
    }
  } else {
    errors.push({
      path: 'author',
      message: "Field 'author' must be either a string or an object with 'name'",
      severity: 'error',
      code: 'INVALID_AUTHOR_TYPE',
    });
  }

  // 6. Validate 'entry' (Required)
  if (typeof raw['entry'] !== 'string' || !raw['entry'].trim()) {
    errors.push({
      path: 'entry',
      message: "Field 'entry' is required and must point to a relative entry file (e.g., 'index.html')",
      severity: 'error',
      code: 'REQUIRED_FIELD_MISSING',
    });
  } else {
    const entry = raw['entry'].trim();
    if (isPathTraversalOrAbsolute(entry)) {
      errors.push({
        path: 'entry',
        message: `Field 'entry' must be a safe relative path and cannot use directory traversal ('..') or absolute paths, got '${entry}'`,
        severity: 'error',
        code: 'INSECURE_PATH',
      });
    } else {
      const lower = entry.toLowerCase();
      const hasValidExt = VALID_ENTRY_EXTENSIONS.some((ext) => lower.endsWith(ext));
      if (!hasValidExt) {
        errors.push({
          path: 'entry',
          message: `Field 'entry' must point to a supported file type (${VALID_ENTRY_EXTENSIONS.join(', ')}), got '${entry}'`,
          severity: 'error',
          code: 'INVALID_ENTRY_EXTENSION',
        });
      }
    }
  }

  // 7. Validate 'icon' (Optional)
  if (raw['icon'] !== undefined) {
    if (typeof raw['icon'] !== 'string' || !raw['icon'].trim()) {
      errors.push({
        path: 'icon',
        message: "Field 'icon' must be a non-empty string path when provided",
        severity: 'error',
        code: 'INVALID_ICON',
      });
    } else {
      const icon = raw['icon'].trim();
      if (isPathTraversalOrAbsolute(icon)) {
        errors.push({
          path: 'icon',
          message: "Field 'icon' must be a safe relative path and cannot use directory traversal ('..') or absolute paths",
          severity: 'error',
          code: 'INSECURE_PATH',
        });
      } else {
        const lower = icon.toLowerCase();
        const hasValidExt = VALID_ICON_EXTENSIONS.some((ext) => lower.endsWith(ext));
        if (!hasValidExt) {
          warnings.push({
            path: 'icon',
            message: `Field 'icon' does not have a standard image extension (${VALID_ICON_EXTENSIONS.join(', ')}). Icons may not render properly.`,
            severity: 'warning',
            code: 'NONSTANDARD_ICON_EXTENSION',
          });
        }
      }
    }
  }

  // 8. Validate 'window' (Optional)
  if (raw['window'] !== undefined) {
    if (typeof raw['window'] !== 'object' || raw['window'] === null || Array.isArray(raw['window'])) {
      errors.push({
        path: 'window',
        message: "Field 'window' must be an object containing window configuration",
        severity: 'error',
        code: 'INVALID_TYPE',
      });
    } else {
      validateWindowConfig(raw['window'] as Record<string, unknown>, errors, warnings);
    }
  }

  // 9. Validate 'permissions' (Optional)
  if (raw['permissions'] !== undefined) {
    if (!Array.isArray(raw['permissions'])) {
      errors.push({
        path: 'permissions',
        message: "Field 'permissions' must be an array of permission strings",
        severity: 'error',
        code: 'INVALID_TYPE',
      });
    } else {
      const perms = raw['permissions'] as unknown[];
      for (let i = 0; i < perms.length; i++) {
        const p = perms[i];
        if (typeof p !== 'string' || !p.trim()) {
          errors.push({
            path: `permissions[${i}]`,
            message: `Permission at index ${i} must be a non-empty string`,
            severity: 'error',
            code: 'INVALID_PERMISSION',
          });
        } else {
          const permStr = p.trim();
          if (!PERMISSION_REGEX.test(permStr)) {
            errors.push({
              path: `permissions[${i}]`,
              message: `Permission '${permStr}' must match format 'namespace:action' (e.g. 'fs:read', 'net:http')`,
              severity: 'error',
              code: 'INVALID_PERMISSION_FORMAT',
            });
          } else {
            if (!KNOWN_PERMISSIONS.has(permStr)) {
              warnings.push({
                path: `permissions[${i}]`,
                message: `Permission '${permStr}' is a custom or unrecognized permission descriptor`,
                severity: 'warning',
                code: 'UNKNOWN_PERMISSION',
              });
            }
            if (SENSITIVE_PERMISSIONS.has(permStr)) {
              warnings.push({
                path: `permissions[${i}]`,
                message: `Permission '${permStr}' grants broad system capabilities and requires explicit user consent during installation`,
                severity: 'warning',
                code: 'HIGH_PRIVILEGE_PERMISSION',
              });
            }
          }
        }
      }
    }
  }

  // 10. Validate 'capabilities' (Optional)
  if (raw['capabilities'] !== undefined) {
    validateCapabilities(raw['capabilities'], errors, warnings);
  }

  // 11. Validate 'minElixVersion' (Optional)
  if (raw['minElixVersion'] !== undefined) {
    if (typeof raw['minElixVersion'] !== 'string') {
      errors.push({
        path: 'minElixVersion',
        message: "Field 'minElixVersion' must be a semver string or range",
        severity: 'error',
        code: 'INVALID_TYPE',
      });
    }
  }

  // 12. Validate URLs (homepage, repository)
  if (raw['homepage'] !== undefined && typeof raw['homepage'] === 'string' && !isValidUrl(raw['homepage'])) {
    warnings.push({
      path: 'homepage',
      message: "Field 'homepage' does not appear to be a valid URL",
      severity: 'warning',
      code: 'INVALID_URL',
    });
  }
  if (raw['repository'] !== undefined && typeof raw['repository'] === 'string' && !isValidUrl(raw['repository'])) {
    warnings.push({
      path: 'repository',
      message: "Field 'repository' does not appear to be a valid URL",
      severity: 'warning',
      code: 'INVALID_URL',
    });
  }

  const valid = errors.length === 0;

  if (!valid) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  // Normalize valid manifest with defaults
  const normalized = normalizeAppManifest(raw as unknown as ElixAppManifest);

  return {
    valid: true,
    manifest: normalized,
    errors: [],
    warnings,
  };
}

/**
 * Validates the window configuration section
 */
function validateWindowConfig(
  win: Record<string, unknown>,
  errors: ValidationIssue[],
  _warnings: ValidationIssue[]
): void {
  const numericProps = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const;

  for (const prop of numericProps) {
    const val = win[prop];
    if (val !== undefined) {
      if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
        errors.push({
          path: `window.${prop}`,
          message: `Window property '${prop}' must be a positive number, got ${JSON.stringify(val)}`,
          severity: 'error',
          code: 'INVALID_WINDOW_DIMENSION',
        });
      }
    }
  }

  const booleanProps = ['resizable', 'alwaysOnTop', 'frame', 'transparent', 'center', 'fullscreen'] as const;
  for (const prop of booleanProps) {
    const val = win[prop];
    if (val !== undefined && typeof val !== 'boolean') {
      errors.push({
        path: `window.${prop}`,
        message: `Window property '${prop}' must be a boolean`,
        severity: 'error',
        code: 'INVALID_TYPE',
      });
    }
  }

  // Cross-field dimensional sanity checks
  const width = win['width'] as number | undefined;
  const minWidth = win['minWidth'] as number | undefined;
  const maxWidth = win['maxWidth'] as number | undefined;
  const height = win['height'] as number | undefined;
  const minHeight = win['minHeight'] as number | undefined;
  const maxHeight = win['maxHeight'] as number | undefined;

  if (width !== undefined && minWidth !== undefined && width < minWidth) {
    errors.push({
      path: 'window.width',
      message: `Initial width (${width}px) cannot be less than minWidth (${minWidth}px)`,
      severity: 'error',
      code: 'WINDOW_CONSTRAINT_VIOLATION',
    });
  }
  if (width !== undefined && maxWidth !== undefined && width > maxWidth) {
    errors.push({
      path: 'window.width',
      message: `Initial width (${width}px) cannot be greater than maxWidth (${maxWidth}px)`,
      severity: 'error',
      code: 'WINDOW_CONSTRAINT_VIOLATION',
    });
  }
  if (minWidth !== undefined && maxWidth !== undefined && minWidth > maxWidth) {
    errors.push({
      path: 'window.minWidth',
      message: `minWidth (${minWidth}px) cannot be greater than maxWidth (${maxWidth}px)`,
      severity: 'error',
      code: 'WINDOW_CONSTRAINT_VIOLATION',
    });
  }

  if (height !== undefined && minHeight !== undefined && height < minHeight) {
    errors.push({
      path: 'window.height',
      message: `Initial height (${height}px) cannot be less than minHeight (${minHeight}px)`,
      severity: 'error',
      code: 'WINDOW_CONSTRAINT_VIOLATION',
    });
  }
  if (height !== undefined && maxHeight !== undefined && height > maxHeight) {
    errors.push({
      path: 'window.height',
      message: `Initial height (${height}px) cannot be greater than maxHeight (${maxHeight}px)`,
      severity: 'error',
      code: 'WINDOW_CONSTRAINT_VIOLATION',
    });
  }
  if (minHeight !== undefined && maxHeight !== undefined && minHeight > maxHeight) {
    errors.push({
      path: 'window.minHeight',
      message: `minHeight (${minHeight}px) cannot be greater than maxHeight (${maxHeight}px)`,
      severity: 'error',
      code: 'WINDOW_CONSTRAINT_VIOLATION',
    });
  }
}

/**
 * Validates dynamic app capabilities exposed for AI Agent and Cordis Tool calling
 */
function validateCapabilities(
  capabilities: unknown,
  errors: ValidationIssue[],
  _warnings: ValidationIssue[]
): void {
  if (typeof capabilities !== 'object' || capabilities === null) {
    errors.push({
      path: 'capabilities',
      message: "Field 'capabilities' must be an object map or an array of capability objects",
      severity: 'error',
      code: 'INVALID_TYPE',
    });
    return;
  }

  const items: Array<{ key: string; val: unknown }> = Array.isArray(capabilities)
    ? capabilities.map((item, idx) => ({ key: `capabilities[${idx}]`, val: item }))
    : Object.entries(capabilities).map(([k, v]) => ({ key: `capabilities.${k}`, val: v }));

  for (const { key, val } of items) {
    if (typeof val !== 'object' || val === null || Array.isArray(val)) {
      errors.push({
        path: key,
        message: `Capability at '${key}' must be a valid capability definition object`,
        severity: 'error',
        code: 'INVALID_CAPABILITY',
      });
      continue;
    }

    const cap = val as Record<string, unknown>;

    // Capability name
    if (typeof cap['name'] !== 'string' || !cap['name'].trim()) {
      errors.push({
        path: `${key}.name`,
        message: `Capability '${key}' must include a non-empty 'name' string`,
        severity: 'error',
        code: 'REQUIRED_FIELD_MISSING',
      });
    } else if (!CAPABILITY_NAME_REGEX.test(cap['name'].trim())) {
      errors.push({
        path: `${key}.name`,
        message: `Capability name '${cap['name']}' contains invalid characters (allowed: alphanumeric, underscore, dot, hyphen)`,
        severity: 'error',
        code: 'INVALID_FORMAT',
      });
    }

    // Capability description
    if (typeof cap['description'] !== 'string' || !cap['description'].trim()) {
      errors.push({
        path: `${key}.description`,
        message: `Capability '${key}' must include a detailed 'description' string for AI tool calling`,
        severity: 'error',
        code: 'REQUIRED_FIELD_MISSING',
      });
    }

    // Capability parameters schema
    if (cap['parameters'] !== undefined) {
      if (typeof cap['parameters'] !== 'object' || cap['parameters'] === null || Array.isArray(cap['parameters'])) {
        errors.push({
          path: `${key}.parameters`,
          message: `Capability '${key}' parameters must be a valid JSON Schema object`,
          severity: 'error',
          code: 'INVALID_SCHEMA',
        });
      } else {
        const params = cap['parameters'] as Record<string, unknown>;
        if (params['type'] !== undefined && params['type'] !== 'object') {
          errors.push({
            path: `${key}.parameters.type`,
            message: `Root parameter schema for tool capability must have type 'object'`,
            severity: 'error',
            code: 'INVALID_SCHEMA_TYPE',
          });
        }
      }
    } else {
      errors.push({
        path: `${key}.parameters`,
        message: `Capability '${key}' must specify a JSON Schema 'parameters' object`,
        severity: 'error',
        code: 'REQUIRED_FIELD_MISSING',
      });
    }

    // Capability timeoutMs
    if (cap['timeoutMs'] !== undefined) {
      if (typeof cap['timeoutMs'] !== 'number' || !Number.isFinite(cap['timeoutMs']) || cap['timeoutMs'] <= 0) {
        errors.push({
          path: `${key}.timeoutMs`,
          message: `Capability '${key}' timeoutMs must be a positive integer in milliseconds`,
          severity: 'error',
          code: 'INVALID_TIMEOUT',
        });
      }
    }
  }
}

/**
 * Normalizes an ELIX App Manifest by populating sensible defaults
 */
export function normalizeAppManifest(manifest: ElixAppManifest): ElixAppManifest {
  const windowDefaults: ElixAppWindowConfig = {
    width: 800,
    height: 600,
    minWidth: 320,
    minHeight: 240,
    resizable: true,
    alwaysOnTop: false,
    frame: true,
    transparent: false,
    center: true,
    fullscreen: false,
  };

  const author: ElixAppAuthor =
    typeof manifest.author === 'string'
      ? manifest.author.trim()
      : {
          name: manifest.author.name.trim(),
          email: manifest.author.email?.trim(),
          url: manifest.author.url?.trim(),
        };

  return {
    ...manifest,
    id: manifest.id.trim(),
    name: manifest.name.trim(),
    version: manifest.version.trim(),
    description: manifest.description.trim(),
    author,
    entry: manifest.entry.trim().replace(/\\/g, '/'),
    icon: manifest.icon ? manifest.icon.trim().replace(/\\/g, '/') : undefined,
    window: {
      ...windowDefaults,
      ...(manifest.window || {}),
    },
    permissions: Array.isArray(manifest.permissions)
      ? Array.from(new Set(manifest.permissions.map((p) => p.trim() as ElixAppPermission)))
      : [],
    capabilities: manifest.capabilities || {},
    categories: Array.isArray(manifest.categories)
      ? manifest.categories.map((c) => c.trim())
      : [],
    keywords: Array.isArray(manifest.keywords)
      ? manifest.keywords.map((k) => k.trim())
      : [],
  };
}

/**
 * Type guard for checking if an unknown value is a valid ElixAppManifest
 */
export function isElixAppManifest(input: unknown): input is ElixAppManifest {
  return validateAppManifest(input).valid;
}

/**
 * Asserts that an unknown value conforms strictly to ElixAppManifest, throwing detailed error if not.
 */
export function assertValidAppManifest(input: unknown): asserts input is ElixAppManifest {
  const result = validateAppManifest(input);
  if (!result.valid) {
    const errorDetails = result.errors.map((e) => ` - [${e.path || 'root'}]: ${e.message} (${e.code})`).join('\n');
    throw new Error(`ELIX App Manifest validation failed with ${result.errors.length} error(s):\n${errorDetails}`);
  }
}

/**
 * Formats a validation report into human-readable text
 */
export function formatValidationReport(result: ManifestValidationResult): string {
  if (result.valid) {
    const warnStr =
      result.warnings.length > 0
        ? `\nWarnings (${result.warnings.length}):\n` +
          result.warnings.map((w) => ` - [${w.path}]: ${w.message}`).join('\n')
        : '';
    return `Manifest is valid for app '${result.manifest?.id}@${result.manifest?.version}'.${warnStr}`;
  }

  const errStr = result.errors.map((e) => ` - [${e.path || 'root'}]: ${e.message} (${e.code})`).join('\n');
  const warnStr =
    result.warnings.length > 0
      ? `\nWarnings (${result.warnings.length}):\n` +
        result.warnings.map((w) => ` - [${w.path}]: ${w.message}`).join('\n')
      : '';

  return `Manifest validation failed (${result.errors.length} errors, ${result.warnings.length} warnings):\n${errStr}${warnStr}`;
}

/**
 * Checks for path traversal sequences or absolute paths
 */
function isPathTraversalOrAbsolute(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes('../') ||
    normalized.includes('/..') ||
    normalized === '..' ||
    normalized.startsWith('http:') ||
    normalized.startsWith('https:')
  ) {
    return true;
  }
  return false;
}

/**
 * Simple URL validation helper
 */
function isValidUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}
