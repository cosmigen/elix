/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Schemastery & JSON Schema Declarations for .ELIXAPP Manifest Specification
 *
 * @module @deepseek-ai/elix-app-bridge/schema
 */
import { Schema } from '@deepseek-ai/schemastery';
/**
 * Schemastery definition for ElixAppWindowConfig
 */
export const ElixAppWindowConfigSchema = Schema.object({
    width: Schema.number().description('Initial window width in pixels').default(800),
    height: Schema.number().description('Initial window height in pixels').default(600),
    minWidth: Schema.number().description('Minimum window width in pixels').default(320),
    minHeight: Schema.number().description('Minimum window height in pixels').default(240),
    maxWidth: Schema.number().description('Maximum window width in pixels'),
    maxHeight: Schema.number().description('Maximum window height in pixels'),
    resizable: Schema.boolean().description('Whether window is resizable').default(true),
    alwaysOnTop: Schema.boolean().description('Whether window is pinned on top').default(false),
    frame: Schema.boolean().description('Whether window displays standard frame').default(true),
    transparent: Schema.boolean().description('Whether window is transparent').default(false),
    title: Schema.string().description('Initial window title override'),
    center: Schema.boolean().description('Whether to center window on launch').default(true),
    fullscreen: Schema.boolean().description('Launch in fullscreen mode').default(false),
    backgroundColor: Schema.string().description('Window background color code'),
}).description('Window appearance and geometry settings');
/**
 * Schemastery definition for ElixAppAuthorObject
 */
export const ElixAppAuthorObjectSchema = Schema.object({
    name: Schema.string().required().description('Author name'),
    email: Schema.string().description('Author email address'),
    url: Schema.string().description('Author website or URL'),
});
/**
 * Schemastery definition for ElixAppAuthor
 */
export const ElixAppAuthorSchema = Schema.union([
    Schema.string().description('Author name string'),
    ElixAppAuthorObjectSchema,
]).description('App author information');
/**
 * Schemastery definition for ElixAppPermission
 */
export const ElixAppPermissionSchema = Schema.string()
    .pattern(/^[a-z0-9_-]+:[a-z0-9_*.-]+$/)
    .description('Permission descriptor in namespace:action format (e.g. fs:read, net:http)');
/**
 * Schemastery definition for JSONSchemaProperty (Capability Parameters)
 */
export const JSONSchemaPropertySchema = (Schema.object({
    type: Schema.union([
        Schema.string(),
        Schema.array(Schema.string()),
    ]),
    description: Schema.string().description('Field description'),
    properties: Schema.dict(Schema.any()).description('Nested object properties'),
    required: Schema.array(Schema.string()).description('Required property keys'),
    items: Schema.any().description('Array item schema'),
    enum: Schema.array(Schema.any()).description('Allowed enum values'),
    default: Schema.any().description('Default value'),
    minimum: Schema.number().description('Minimum numeric constraint'),
    maximum: Schema.number().description('Maximum numeric constraint'),
    minLength: Schema.number().description('Minimum string length'),
    maxLength: Schema.number().description('Maximum string length'),
    pattern: Schema.string().description('Regex pattern constraint'),
    additionalProperties: Schema.union([Schema.boolean(), Schema.any()]),
    title: Schema.string().description('Field title'),
}).description('JSON Schema parameter definition'));
/**
 * Schemastery definition for JSONSchemaObject
 */
export const JSONSchemaObjectSchema = (Schema.object({
    type: Schema.const('object').default('object'),
    properties: Schema.dict(JSONSchemaPropertySchema).default({}),
    required: Schema.array(Schema.string()),
    additionalProperties: Schema.union([Schema.boolean(), Schema.any()]),
}).required().description('JSON Schema parameters object'));
/**
 * Schemastery definition for ElixAppCapability
 */
export const ElixAppCapabilitySchema = (Schema.object({
    name: Schema.string().required().pattern(/^[a-zA-Z0-9_.-]+$/).description('Unique capability name'),
    description: Schema.string().required().description('Description for AI tool calling'),
    parameters: JSONSchemaObjectSchema,
    returns: JSONSchemaPropertySchema.description('Optional return type schema'),
    permissions: Schema.array(ElixAppPermissionSchema).description('Required permissions'),
    timeoutMs: Schema.number().description('Execution timeout in milliseconds').default(30000),
}).description('Capability exposed for Cordis tool registration'));
/**
 * Schemastery definition for the full ElixAppManifest (.ELIXAPP / elix.app.json)
 */
export const ElixAppManifestSchema = (Schema.object({
    id: Schema.string()
        .required()
        .pattern(/^[a-z0-9]+([.-][a-z0-9]+)*$/)
        .description('Unique app ID (e.g. com.elix.calc or note-taker)'),
    name: Schema.string().required().description('Human-readable display name'),
    version: Schema.string()
        .required()
        .pattern(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/)
        .description('Semantic version string (SemVer X.Y.Z)'),
    description: Schema.string().required().description('Short description of the application'),
    author: ElixAppAuthorSchema.required(),
    entry: Schema.string().required().description('Relative path to main entry file (e.g. index.html)'),
    icon: Schema.string().description('Relative path to app icon file'),
    window: ElixAppWindowConfigSchema,
    permissions: Schema.array(ElixAppPermissionSchema).default([]),
    capabilities: Schema.union([
        Schema.dict(ElixAppCapabilitySchema),
        Schema.array(ElixAppCapabilitySchema),
    ]).description('Dynamic capabilities exposed as Cordis tools'),
    homepage: Schema.string().description('Application homepage URL'),
    repository: Schema.string().description('Application source repository URL'),
    license: Schema.string().description('Software license identifier'),
    categories: Schema.array(Schema.string()).description('App store/launcher categories'),
    keywords: Schema.array(Schema.string()).description('Keywords for search indexing'),
    minElixVersion: Schema.string().description('Minimum required ELIX OS runtime version'),
}).description('ELIX Native Application Manifest Specification'));
/**
 * Standard Raw JSON Schema v7 export for static / external validation tools
 */
export const ELIX_APP_MANIFEST_JSON_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'ElixAppManifest',
    description: 'ELIX Native App Manifest (.ELIXAPP / elix.app.json)',
    type: 'object',
    required: ['id', 'name', 'version', 'description', 'author', 'entry'],
    properties: {
        id: {
            type: 'string',
            pattern: '^[a-z0-9]+([.-][a-z0-9]+)*$',
            description: 'Unique app ID (e.g. com.elix.calc or note-taker)',
        },
        name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Display name of application',
        },
        version: {
            type: 'string',
            pattern: '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$',
            description: 'SemVer version string',
        },
        description: {
            type: 'string',
            description: 'Summary of the application',
        },
        author: {
            oneOf: [
                { type: 'string' },
                {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        url: { type: 'string', format: 'uri' },
                    },
                },
            ],
        },
        entry: {
            type: 'string',
            description: 'Relative path to entry file (e.g. index.html)',
        },
        icon: {
            type: 'string',
            description: 'Relative path to icon image',
        },
        window: {
            type: 'object',
            properties: {
                width: { type: 'integer', minimum: 100 },
                height: { type: 'integer', minimum: 100 },
                minWidth: { type: 'integer', minimum: 50 },
                minHeight: { type: 'integer', minimum: 50 },
                maxWidth: { type: 'integer' },
                maxHeight: { type: 'integer' },
                resizable: { type: 'boolean' },
                alwaysOnTop: { type: 'boolean' },
                frame: { type: 'boolean' },
                transparent: { type: 'boolean' },
                title: { type: 'string' },
                center: { type: 'boolean' },
                fullscreen: { type: 'boolean' },
                backgroundColor: { type: 'string' },
            },
        },
        permissions: {
            type: 'array',
            items: {
                type: 'string',
                pattern: '^[a-z0-9_-]+:[a-z0-9_*.-]+$',
            },
        },
        capabilities: {
            oneOf: [
                {
                    type: 'object',
                    additionalProperties: {
                        type: 'object',
                        required: ['name', 'description', 'parameters'],
                        properties: {
                            name: { type: 'string' },
                            description: { type: 'string' },
                            parameters: {
                                type: 'object',
                                required: ['type'],
                                properties: {
                                    type: { type: 'string', enum: ['object'] },
                                    properties: { type: 'object' },
                                    required: { type: 'array', items: { type: 'string' } },
                                },
                            },
                            returns: { type: 'object' },
                            permissions: { type: 'array', items: { type: 'string' } },
                            timeoutMs: { type: 'integer', minimum: 100 },
                        },
                    },
                },
                {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['name', 'description', 'parameters'],
                        properties: {
                            name: { type: 'string' },
                            description: { type: 'string' },
                            parameters: {
                                type: 'object',
                                required: ['type'],
                                properties: {
                                    type: { type: 'string', enum: ['object'] },
                                    properties: { type: 'object' },
                                    required: { type: 'array', items: { type: 'string' } },
                                },
                            },
                            returns: { type: 'object' },
                            permissions: { type: 'array', items: { type: 'string' } },
                            timeoutMs: { type: 'integer', minimum: 100 },
                        },
                    },
                },
            ],
        },
        homepage: { type: 'string', format: 'uri' },
        repository: { type: 'string', format: 'uri' },
        license: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' } },
        keywords: { type: 'array', items: { type: 'string' } },
        minElixVersion: { type: 'string' },
    },
    additionalProperties: true,
};
//# sourceMappingURL=schema.js.map