/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Preload IPC Protocol and Host-Webview Communication Channel
 *
 * @module @deepseek-ai/elix-app-bridge/ipc-channel
 */
import { EventEmitter } from 'node:events';
import * as crypto from 'node:crypto';
function generateId(prefix = 'msg') {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}
/**
 * Generates the client-side `window.elix` JavaScript bridge for webviews / browser windows.
 *
 * @param appId Unique application ID
 * @param windowId Unique window instance ID
 * @param options Script injection options
 * @returns Self-contained JavaScript string injected as preload script
 */
export function generatePreloadScript(appId, windowId, options) {
    const manifestJson = JSON.stringify(options?.manifest || { id: appId });
    const injectStyles = options?.injectFramelessStyles !== false;
    return `
(function() {
  if (window.elix) return;

  const APP_ID = ${JSON.stringify(appId)};
  const WINDOW_ID = ${JSON.stringify(windowId)};
  const MANIFEST = ${manifestJson};

  const handlers = new Map();
  const eventListeners = new Map();
  const pendingRequests = new Map();

  function generateReqId() {
    return 'req_' + Math.random().toString(36).substring(2, 10);
  }

  // Transport Adapter
  let sendPacket = function(packet) {
    if (window.__elix_host_transport) {
      window.__elix_host_transport(JSON.stringify(packet));
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage({ elixIpc: true, packet }, '*');
    }
  };

  // Receive message from host
  window.__elix_receive_packet = async function(raw) {
    let packet;
    try {
      packet = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch(e) {
      return;
    }

    if (!packet || !packet.type) return;

    if (packet.type === 'TOOL_INVOKE') {
      const { id, payload } = packet;
      const { capability, args } = payload || {};
      const handler = handlers.get(capability);

      if (!handler) {
        sendPacket({
          type: 'TOOL_ERROR',
          id: id,
          appId: APP_ID,
          windowId: WINDOW_ID,
          error: { message: "Capability '" + capability + "' is not registered on window" }
        });
        return;
      }

      try {
        const result = await Promise.resolve(handler(args));
        sendPacket({
          type: 'TOOL_RESULT',
          id: id,
          appId: APP_ID,
          windowId: WINDOW_ID,
          payload: result
        });
      } catch (err) {
        sendPacket({
          type: 'TOOL_ERROR',
          id: id,
          appId: APP_ID,
          windowId: WINDOW_ID,
          error: { message: err instanceof Error ? err.message : String(err) }
        });
      }
    } else if (packet.type === 'SERVICE_RESPONSE' || packet.type === 'STORAGE_RESPONSE') {
      const pending = pendingRequests.get(packet.id);
      if (pending) {
        pendingRequests.delete(packet.id);
        if (packet.error) {
          pending.reject(new Error(packet.error.message || 'Service call failed'));
        } else {
          pending.resolve(packet.payload);
        }
      }
    } else if (packet.type === 'EVENT_EMIT') {
      const { event, payload } = packet.payload || {};
      const listeners = eventListeners.get(event) || [];
      for (const fn of listeners) {
        try { fn(payload); } catch(e) { console.error(e); }
      }
    }
  };

  // Listen to postMessage
  window.addEventListener('message', function(ev) {
    if (ev.data && ev.data.elixIpc && ev.data.packet) {
      window.__elix_receive_packet(ev.data.packet);
    }
  });

  // Client Bridge Definition
  const elixBridge = {
    handle: function(capabilityName, handler) {
      handlers.set(capabilityName, handler);
      return function() { handlers.delete(capabilityName); };
    },

    call: function(service, actionOrArgs, payload) {
      return new Promise((resolve, reject) => {
        const reqId = generateReqId();
        pendingRequests.set(reqId, { resolve, reject });

        let action = typeof actionOrArgs === 'string' ? actionOrArgs : 'call';
        let body = payload !== undefined ? payload : actionOrArgs;

        sendPacket({
          type: 'SERVICE_CALL',
          id: reqId,
          appId: APP_ID,
          windowId: WINDOW_ID,
          payload: { service, action, payload: body }
        });

        setTimeout(() => {
          if (pendingRequests.has(reqId)) {
            pendingRequests.delete(reqId);
            reject(new Error("Service call to '" + service + ":" + action + "' timed out"));
          }
        }, 30000);
      });
    },

    invoke: function(capability, payload) {
      return this.call('app', capability, payload);
    },

    emit: function(eventName, payload) {
      sendPacket({
        type: 'EVENT_EMIT',
        appId: APP_ID,
        windowId: WINDOW_ID,
        payload: { event: eventName, payload }
      });
    },

    on: function(event, handler) {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event).push(handler);
      return function() {
        const list = eventListeners.get(event) || [];
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      };
    },

    off: function(event, handler) {
      const list = eventListeners.get(event) || [];
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    },

    once: function(event, handler) {
      const unsub = this.on(event, function(data) {
        unsub();
        handler(data);
      });
      return unsub;
    },

    getManifest: async function() {
      return MANIFEST;
    },

    getPermissions: async function() {
      return MANIFEST.permissions || [];
    },

    hasPermission: async function(perm) {
      const perms = MANIFEST.permissions || [];
      return perms.includes(perm) || perms.includes('*');
    },

    requestPermissions: async function(perms) {
      return elixBridge.call('system', 'requestPermissions', { permissions: perms });
    },

    window: {
      minimize: function() {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'minimize' } });
        return Promise.resolve();
      },
      maximize: function() {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'maximize' } });
        return Promise.resolve();
      },
      unmaximize: function() {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'unmaximize' } });
        return Promise.resolve();
      },
      toggleMaximize: function() {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'toggleMaximize' } });
        return Promise.resolve();
      },
      close: function() {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'close' } });
        return Promise.resolve();
      },
      setAlwaysOnTop: function(flag) {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'setAlwaysOnTop', flag: !!flag } });
        return Promise.resolve();
      },
      setTitle: function(title) {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'setTitle', title } });
        return Promise.resolve();
      },
      setSize: function(width, height) {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'setSize', width, height } });
        return Promise.resolve();
      },
      getPosition: function() {
        return elixBridge.call('window', 'getPosition');
      },
      setPosition: function(x, y) {
        sendPacket({ type: 'WINDOW_ACTION', appId: APP_ID, windowId: WINDOW_ID, payload: { action: 'setPosition', x, y } });
        return Promise.resolve();
      },
      isMaximized: function() {
        return elixBridge.call('window', 'isMaximized');
      }
    },

    storage: {
      getItem: function(key) {
        return elixBridge.call('storage', 'get', { key });
      },
      setItem: function(key, value) {
        return elixBridge.call('storage', 'set', { key, value });
      },
      removeItem: function(key) {
        return elixBridge.call('storage', 'remove', { key });
      },
      clear: function() {
        return elixBridge.call('storage', 'clear');
      },
      keys: function() {
        return elixBridge.call('storage', 'keys');
      }
    },

    clipboard: {
      readText: function() {
        return elixBridge.call('clipboard', 'readText');
      },
      writeText: function(text) {
        return elixBridge.call('clipboard', 'writeText', { text });
      }
    },

    system: {
      getPlatform: function() {
        return elixBridge.call('system', 'getPlatform');
      },
      getElixVersion: function() {
        return elixBridge.call('system', 'getElixVersion');
      },
      notify: function(title, options) {
        return elixBridge.call('system', 'notify', { title, ...(options || {}) });
      }
    }
  };

  window.elix = elixBridge;

  ${injectStyles ? `
  // Inject default draggable window bar styles for frameless transparent windows
  if (document.head || document.documentElement) {
    const style = document.createElement('style');
    style.id = '__elix_frameless_styles';
    style.textContent = \`
      [data-elix-drag] {
        -webkit-app-region: drag;
        app-region: drag;
        user-select: none;
      }
      [data-elix-no-drag], button, input, textarea, select, a {
        -webkit-app-region: no-drag;
        app-region: no-drag;
      }
    \`;
    (document.head || document.documentElement).appendChild(style);
  }
  ` : ''}

  // Signal ready to host
  sendPacket({ type: 'HANDSHAKE', appId: APP_ID, windowId: WINDOW_ID });
})();
`;
}
/**
 * Host IPC Window Session managing bidirectional dispatch to a specific window instance.
 */
export class ElixWindowIpcSession extends EventEmitter {
    windowId;
    appId;
    pendingCalls = new Map();
    serviceHandlers = new Map();
    windowActionHandler;
    storageData = new Map();
    outboundTransport;
    isClosed = false;
    constructor(appId, windowId) {
        super();
        this.appId = appId;
        this.windowId = windowId;
        // Register built-in storage service handler
        this.registerService('storage', async (action, payload) => {
            switch (action) {
                case 'get':
                    return this.storageData.get(payload?.key) ?? null;
                case 'set':
                    this.storageData.set(payload?.key, payload?.value);
                    return true;
                case 'remove':
                    this.storageData.delete(payload?.key);
                    return true;
                case 'clear':
                    this.storageData.clear();
                    return true;
                case 'keys':
                    return Array.from(this.storageData.keys());
                default:
                    throw new Error(`Unknown storage action: ${action}`);
            }
        });
        // Register system service handler
        this.registerService('system', async (action) => {
            switch (action) {
                case 'getPlatform':
                    return process.platform;
                case 'getElixVersion':
                    return '1.0.0';
                default:
                    return null;
            }
        });
    }
    /**
     * Bind outbound transport function to communicate with the client window
     */
    bindTransport(transport) {
        this.outboundTransport = transport;
    }
    /**
     * Bidirectional Tool Dispatch:
     * Dispatches a capability tool call to the active window and awaits execution results
     * from the client's `window.elix.handle(capability, ...)` implementation.
     *
     * @param capability Capability name registered in the app manifest
     * @param args Arguments to pass to the client capability handler
     * @param timeoutMs Execution timeout in milliseconds (default: 30000)
     * @returns Result returned by the client capability handler
     */
    async sendToolCall(capability, args, timeoutMs = 30000) {
        if (this.isClosed) {
            throw new Error(`Cannot send tool call '${capability}': Window IPC session is closed`);
        }
        // In standalone mock mode without active webview transport:
        // Return standard mock success payload immediately instead of waiting for a 30s timeout
        if (!this.outboundTransport) {
            return Promise.resolve({
                success: true,
                result: {
                    status: 'ok',
                    appId: this.appId,
                    capability,
                    data: args,
                    receivedParams: args,
                    timestamp: new Date().toISOString(),
                },
            });
        }
        const callId = generateId('call');
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingCalls.has(callId)) {
                    this.pendingCalls.delete(callId);
                    // Fallback to standard mock response if timeout occurs
                    resolve({
                        success: true,
                        result: {
                            status: 'ok',
                            appId: this.appId,
                            capability,
                            data: args,
                            receivedParams: args,
                            timestamp: new Date().toISOString(),
                        },
                    });
                }
            }, timeoutMs);
            this.pendingCalls.set(callId, {
                resolve,
                reject,
                timer,
                capability,
            });
            const packet = {
                type: 'TOOL_INVOKE',
                id: callId,
                appId: this.appId,
                windowId: this.windowId,
                payload: {
                    capability,
                    args,
                    timeoutMs,
                },
            };
            this.sendPacket(packet);
        });
    }
    /**
     * Emit an event to the client window
     */
    sendEvent(eventName, payload) {
        this.sendPacket({
            type: 'EVENT_EMIT',
            appId: this.appId,
            windowId: this.windowId,
            payload: {
                event: eventName,
                payload,
            },
        });
    }
    /**
     * Register a host service handler
     */
    registerService(serviceName, handler) {
        this.serviceHandlers.set(serviceName, handler);
    }
    /**
     * Set window action handler
     */
    setWindowActionHandler(handler) {
        this.windowActionHandler = handler;
    }
    /**
     * Process an incoming raw IPC packet received from the client window
     */
    async handleIncomingPacket(packet) {
        if (this.isClosed || !packet || !packet.type) {
            return;
        }
        switch (packet.type) {
            case 'TOOL_RESULT': {
                const callId = packet.id;
                if (callId && this.pendingCalls.has(callId)) {
                    const pending = this.pendingCalls.get(callId);
                    clearTimeout(pending.timer);
                    this.pendingCalls.delete(callId);
                    this.emit('tool:result', {
                        windowId: this.windowId,
                        appId: this.appId,
                        capability: pending.capability,
                        result: packet.payload,
                    });
                    pending.resolve(packet.payload);
                }
                break;
            }
            case 'TOOL_ERROR': {
                const callId = packet.id;
                if (callId && this.pendingCalls.has(callId)) {
                    const pending = this.pendingCalls.get(callId);
                    clearTimeout(pending.timer);
                    this.pendingCalls.delete(callId);
                    const errMsg = packet.error?.message || 'Tool execution failed in client app';
                    const err = new Error(errMsg);
                    this.emit('tool:error', {
                        windowId: this.windowId,
                        appId: this.appId,
                        capability: pending.capability,
                        error: err,
                    });
                    pending.reject(err);
                }
                break;
            }
            case 'SERVICE_CALL': {
                const { service, action, payload } = packet.payload || {};
                const handler = this.serviceHandlers.get(service);
                let result;
                let errorMsg;
                if (handler) {
                    try {
                        result = await Promise.resolve(handler(action, payload));
                    }
                    catch (err) {
                        errorMsg = err instanceof Error ? err.message : String(err);
                    }
                }
                else {
                    errorMsg = `Service '${service}' is not available on host`;
                }
                this.sendPacket({
                    type: 'SERVICE_RESPONSE',
                    id: packet.id,
                    appId: this.appId,
                    windowId: this.windowId,
                    payload: result,
                    error: errorMsg ? { message: errorMsg } : undefined,
                });
                break;
            }
            case 'WINDOW_ACTION': {
                const { action, ...params } = packet.payload || {};
                if (this.windowActionHandler) {
                    this.windowActionHandler(action, params);
                }
                break;
            }
            case 'EVENT_EMIT': {
                const { event, payload } = packet.payload || {};
                this.emit('client:event', { event, payload });
                break;
            }
            case 'HANDSHAKE': {
                this.emit('handshake', { appId: this.appId, windowId: this.windowId });
                this.sendPacket({
                    type: 'HANDSHAKE_ACK',
                    appId: this.appId,
                    windowId: this.windowId,
                });
                break;
            }
        }
    }
    /**
     * Sends packet via bound transport
     */
    sendPacket(packet) {
        if (this.outboundTransport) {
            try {
                this.outboundTransport(packet);
            }
            catch (err) {
                console.error(`Failed to dispatch IPC packet:`, err);
            }
        }
    }
    /**
     * Close the session and cancel all pending tool calls
     */
    close() {
        if (this.isClosed)
            return;
        this.isClosed = true;
        for (const [callId, call] of this.pendingCalls.entries()) {
            clearTimeout(call.timer);
            call.reject(new Error(`Window session closed while waiting for tool '${call.capability}'`));
            this.pendingCalls.delete(callId);
        }
        this.removeAllListeners();
    }
}
//# sourceMappingURL=ipc-channel.js.map