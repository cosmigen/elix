/**
 * ELIX OS Universal App Runtime
 * Declarative Tab Routing & Frameless Window Controls for all ELIX OS native applications.
 */

(function initElixAppRuntime() {
  function setupUniversalTabRouting() {
    const navButtons = document.querySelectorAll('[data-tab], [data-target], [data-view], .nav-item, .tab-btn, .tab-item, .sub-nav-btn, .rail-btn');
    if (!navButtons.length) return;

    navButtons.forEach(btn => {
      if (btn.__elix_tab_bound) return;
      btn.__elix_tab_bound = true;

      btn.addEventListener('click', (e) => {
        const targetId = btn.getAttribute('data-tab') || 
                         btn.getAttribute('data-target') || 
                         btn.getAttribute('data-view') || 
                         btn.getAttribute('href')?.replace(/^#/, '');
        if (!targetId) return;

        // Deactivate siblings in the same navigation container
        const container = btn.closest('nav, .sidebar, .tab-bar, .sub-nav, .activity-rail, .nav-tabs, .tabs') || btn.parentElement || document;
        container.querySelectorAll('.nav-item, .tab-btn, .tab-item, .sub-nav-btn, .rail-btn, button, a').forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');

        // Toggle target view panel
        const parentViewScope = btn.closest('.app-container, .main-container, .center-workspace, .workspace, main, body') || document;
        const views = parentViewScope.querySelectorAll('.view-panel, .tab-content, .panel-view, .view-section, section[id], div[id^="view-"], div[id^="tab-"]');
        
        let found = false;
        views.forEach(view => {
          const isTarget = view.id === targetId || 
                           view.id === 'view-' + targetId || 
                           view.id === 'tab-' + targetId ||
                           view.getAttribute('data-panel') === targetId ||
                           view.getAttribute('data-view') === targetId;
          if (isTarget) {
            view.style.display = 'flex';
            view.classList.add('active');
            found = true;
          } else if (view.classList.contains('view-panel') || 
                     view.classList.contains('tab-content') || 
                     view.classList.contains('panel-view') ||
                     view.classList.contains('view-section')) {
            view.style.display = 'none';
            view.classList.remove('active');
          }
        });

        // Fallback search
        if (!found) {
          const directTarget = document.getElementById(targetId) || 
                               document.getElementById('view-' + targetId) || 
                               document.getElementById('tab-' + targetId);
          if (directTarget) {
            directTarget.style.display = 'flex';
            directTarget.classList.add('active');
          }
        }
      });
    });
  }

  function setupWindowControls() {
    let ipcRenderer = null;
    try {
      if (typeof window !== 'undefined' && window.require) {
        ipcRenderer = window.require('electron').ipcRenderer;
      } else if (window.electron && window.electron.ipcRenderer) {
        ipcRenderer = window.electron.ipcRenderer;
      }
    } catch (e) {}

    const sendWinAction = (channel) => {
      if (ipcRenderer) {
        ipcRenderer.send(channel);
      } else if (typeof ws !== 'undefined' && ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'window_action', action: channel }));
      } else if (window.__ELIX_WS__ && window.__ELIX_WS__.readyState === 1) {
        window.__ELIX_WS__.send(JSON.stringify({ type: 'window_action', action: channel }));
      } else {
        console.log('[Window Action]', channel);
      }
    };

    window.sendNativeWindowCommand = sendWinAction;

    const minBtns = document.querySelectorAll('#win-min, #btnMin, .control-btn-min, [data-win-action="min"]');
    const maxBtns = document.querySelectorAll('#win-max, #btnMax, .control-btn-max, [data-win-action="max"]');
    const closeBtns = document.querySelectorAll('#win-close, #btnClose, .control-btn-close, [data-win-action="close"]');

    minBtns.forEach(b => {
      if (!b.__win_bound) {
        b.__win_bound = true;
        b.addEventListener('click', () => sendWinAction('elix:window:minimize'));
      }
    });
    maxBtns.forEach(b => {
      if (!b.__win_bound) {
        b.__win_bound = true;
        b.addEventListener('click', () => sendWinAction('elix:window:maximize'));
      }
    });
    closeBtns.forEach(b => {
      if (!b.__win_bound) {
        b.__win_bound = true;
        b.addEventListener('click', () => sendWinAction('elix:window:close'));
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupUniversalTabRouting();
      setupWindowControls();
    });
  } else {
    setupUniversalTabRouting();
    setupWindowControls();
  }
})();
