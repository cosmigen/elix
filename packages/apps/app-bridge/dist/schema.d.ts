/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Schemastery & JSON Schema Declarations for .ELIXAPP Manifest Specification
 *
 * @module @deepseek-ai/elix-app-bridge/schema
 */
import { Schema } from '@deepseek-ai/schemastery';
import type { ElixAppAuthor, ElixAppAuthorObject, ElixAppCapability, ElixAppManifest, ElixAppPermission, ElixAppWindowConfig, JSONSchemaObject, JSONSchemaProperty } from './types.js';
/**
 * Schemastery definition for ElixAppWindowConfig
 */
export declare const ElixAppWindowConfigSchema: Schema<ElixAppWindowConfig>;
/**
 * Schemastery definition for ElixAppAuthorObject
 */
export declare const ElixAppAuthorObjectSchema: Schema<ElixAppAuthorObject>;
/**
 * Schemastery definition for ElixAppAuthor
 */
export declare const ElixAppAuthorSchema: Schema<ElixAppAuthor>;
/**
 * Schemastery definition for ElixAppPermission
 */
export declare const ElixAppPermissionSchema: Schema<ElixAppPermission>;
/**
 * Schemastery definition for JSONSchemaProperty (Capability Parameters)
 */
export declare const JSONSchemaPropertySchema: Schema<JSONSchemaProperty>;
/**
 * Schemastery definition for JSONSchemaObject
 */
export declare const JSONSchemaObjectSchema: Schema<JSONSchemaObject>;
/**
 * Schemastery definition for ElixAppCapability
 */
export declare const ElixAppCapabilitySchema: Schema<ElixAppCapability>;
/**
 * Schemastery definition for the full ElixAppManifest (.ELIXAPP / elix.app.json)
 */
export declare const ElixAppManifestSchema: Schema<ElixAppManifest>;
/**
 * Standard Raw JSON Schema v7 export for static / external validation tools
 */
export declare const ELIX_APP_MANIFEST_JSON_SCHEMA: {
    readonly $schema: "http://json-schema.org/draft-07/schema#";
    readonly title: "ElixAppManifest";
    readonly description: "ELIX Native App Manifest (.ELIXAPP / elix.app.json)";
    readonly type: "object";
    readonly required: readonly ["id", "name", "version", "description", "author", "entry"];
    readonly properties: {
        readonly id: {
            readonly type: "string";
            readonly pattern: "^[a-z0-9]+([.-][a-z0-9]+)*$";
            readonly description: "Unique app ID (e.g. com.elix.calc or note-taker)";
        };
        readonly name: {
            readonly type: "string";
            readonly minLength: 1;
            readonly maxLength: 100;
            readonly description: "Display name of application";
        };
        readonly version: {
            readonly type: "string";
            readonly pattern: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$";
            readonly description: "SemVer version string";
        };
        readonly description: {
            readonly type: "string";
            readonly description: "Summary of the application";
        };
        readonly author: {
            readonly oneOf: readonly [{
                readonly type: "string";
            }, {
                readonly type: "object";
                readonly required: readonly ["name"];
                readonly properties: {
                    readonly name: {
                        readonly type: "string";
                    };
                    readonly email: {
                        readonly type: "string";
                        readonly format: "email";
                    };
                    readonly url: {
                        readonly type: "string";
                        readonly format: "uri";
                    };
                };
            }];
        };
        readonly entry: {
            readonly type: "string";
            readonly description: "Relative path to entry file (e.g. index.html)";
        };
        readonly icon: {
            readonly type: "string";
            readonly description: "Relative path to icon image";
        };
        readonly window: {
            readonly type: "object";
            readonly properties: {
                readonly width: {
                    readonly type: "integer";
                    readonly minimum: 100;
                };
                readonly height: {
                    readonly type: "integer";
                    readonly minimum: 100;
                };
                readonly minWidth: {
                    readonly type: "integer";
                    readonly minimum: 50;
                };
                readonly minHeight: {
                    readonly type: "integer";
                    readonly minimum: 50;
                };
                readonly maxWidth: {
                    readonly type: "integer";
                };
                readonly maxHeight: {
                    readonly type: "integer";
                };
                readonly resizable: {
                    readonly type: "boolean";
                };
                readonly alwaysOnTop: {
                    readonly type: "boolean";
                };
                readonly frame: {
                    readonly type: "boolean";
                };
                readonly transparent: {
                    readonly type: "boolean";
                };
                readonly title: {
                    readonly type: "string";
                };
                readonly center: {
                    readonly type: "boolean";
                };
                readonly fullscreen: {
                    readonly type: "boolean";
                };
                readonly backgroundColor: {
                    readonly type: "string";
                };
            };
        };
        readonly permissions: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
                readonly pattern: "^[a-z0-9_-]+:[a-z0-9_*.-]+$";
            };
        };
        readonly capabilities: {
            readonly oneOf: readonly [{
                readonly type: "object";
                readonly additionalProperties: {
                    readonly type: "object";
                    readonly required: readonly ["name", "description", "parameters"];
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                        };
                        readonly description: {
                            readonly type: "string";
                        };
                        readonly parameters: {
                            readonly type: "object";
                            readonly required: readonly ["type"];
                            readonly properties: {
                                readonly type: {
                                    readonly type: "string";
                                    readonly enum: readonly ["object"];
                                };
                                readonly properties: {
                                    readonly type: "object";
                                };
                                readonly required: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                        readonly returns: {
                            readonly type: "object";
                        };
                        readonly permissions: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly timeoutMs: {
                            readonly type: "integer";
                            readonly minimum: 100;
                        };
                    };
                };
            }, {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly required: readonly ["name", "description", "parameters"];
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                        };
                        readonly description: {
                            readonly type: "string";
                        };
                        readonly parameters: {
                            readonly type: "object";
                            readonly required: readonly ["type"];
                            readonly properties: {
                                readonly type: {
                                    readonly type: "string";
                                    readonly enum: readonly ["object"];
                                };
                                readonly properties: {
                                    readonly type: "object";
                                };
                                readonly required: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                        readonly returns: {
                            readonly type: "object";
                        };
                        readonly permissions: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly timeoutMs: {
                            readonly type: "integer";
                            readonly minimum: 100;
                        };
                    };
                };
            }];
        };
        readonly homepage: {
            readonly type: "string";
            readonly format: "uri";
        };
        readonly repository: {
            readonly type: "string";
            readonly format: "uri";
        };
        readonly license: {
            readonly type: "string";
        };
        readonly categories: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly keywords: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly minElixVersion: {
            readonly type: "string";
        };
    };
    readonly additionalProperties: true;
};
//# sourceMappingURL=schema.d.ts.map