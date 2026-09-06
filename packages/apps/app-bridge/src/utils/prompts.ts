/**
 * Terminal UI and Consent Prompts Utility for ELIX OS
 * Uses @clack/prompts when available, with clean fallback to readline/console.
 * 
 * @module @deepseek-ai/elix-app-bridge/utils/prompts
 */

import * as readline from 'node:readline';
import type { AppConsentPayload } from '../types.js';

export async function promptConsentCli(consent: AppConsentPayload): Promise<boolean> {
  // If @clack/prompts is available, try dynamic import
  try {
    const clack = await import('@clack/prompts');
    if (clack && typeof clack.intro === 'function') {
      clack.intro(`\x1b[36m[ELIX OS App Installer]\x1b[0m Installing \x1b[1m${consent.name}\x1b[0m (${consent.appId})`);

      const authorStr = typeof consent.author === 'string'
        ? consent.author
        : `${consent.author.name}${consent.author.email ? ` <${consent.author.email}>` : ''}`;

      clack.log.info(`Version: ${consent.version} | Author: ${authorStr}`);
      clack.log.info(`Description: ${consent.description}`);

      if (consent.permissions.length > 0) {
        clack.log.step(`Requested System Permissions (${consent.permissions.length}):`);
        for (const perm of consent.permissions) {
          const prefix = perm.sensitive ? '\x1b[31m[HIGH PRIVILEGE]\x1b[0m' : '\x1b[33m[STANDARD]\x1b[0m';
          clack.log.message(`  ${prefix} \x1b[1m${perm.label}\x1b[0m (${perm.permission}) - ${perm.description}`);
        }
      } else {
        clack.log.info('Permissions: None requested (Runs in complete sandbox)');
      }

      if (consent.capabilities.length > 0) {
        clack.log.step(`Exported AI Agent Capabilities (${consent.capabilities.length}):`);
        for (const cap of consent.capabilities) {
          clack.log.message(`  * \x1b[1m${cap.name}\x1b[0m: ${cap.description} (params: ${cap.parameterNames.join(', ') || 'none'})`);
        }
      }

      const confirmed = await clack.confirm({
        message: `Authorize installation of '${consent.name}' and grant ${consent.permissions.length} requested permissions?`,
        initialValue: true,
      });

      if (clack.isCancel(confirmed) || !confirmed) {
        clack.cancel('Installation cancelled by user.');
        return false;
      }

      clack.outro(`Authorization granted for \x1b[1m${consent.name}\x1b[0m.`);
      return true;
    }
  } catch {
    // Fall back to built-in readline prompt
  }

  // Built-in readline fallback
  console.log(`\n=== [ELIX OS App Installer] ===`);
  console.log(`App: ${consent.name} (${consent.appId}) v${consent.version}`);
  console.log(`Description: ${consent.description}`);
  console.log(`Requested Permissions: ${consent.permissions.map((p) => p.permission).join(', ') || 'none'}`);
  console.log(`Exported Capabilities: ${consent.capabilities.map((c) => c.name).join(', ') || 'none'}\n`);

  if (!process.stdin.isTTY) {
    return true; // Non-interactive mode auto-approve if invoked directly
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`Do you want to install '${consent.name}'? (y/N): `, (answer) => {
      rl.close();
      const approved = answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
      resolve(approved);
    });
  });
}
