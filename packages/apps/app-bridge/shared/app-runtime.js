  <script>
    // ELIX OS Universal Window Control Binding & Declarative Tab Routing
    (function initWindowControlBindings() {
      let ipc = null;
      try {
        if (typeof window !== "undefined" && window.require) {
          ipc = window.require("electron").ipcRenderer;
        } else if (window.electron && window.electron.ipcRenderer) {
          ipc = window.electron.ipcRenderer;
        }
      } catch (e) {}

      const sendAction = function(action) {
        if (ipc) {
          ipc.send("window-" + action);
          ipc.send("elix:window:" + action);
          ipc.send("app-window-" + action);
        } else if (typeof ws !== "undefined" && ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "window_action", action: "window-" + action }));
        } else if (window.__ELIX_WS__ && window.__ELIX_WS__.readyState === 1) {
          window.__ELIX_WS__.send(JSON.stringify({ type: "window_action", action: "window-" + action }));
        }
      };

      function bindControls() {
        document.getElementById("win-min")?.addEventListener("click", () => sendAction("minimize"));
        document.getElementById("win-max")?.addEventListener("click", () => sendAction("maximize"));
        document.getElementById("win-close")?.addEventListener("click", () => sendAction("close"));
        document.getElementById("btn-minimize")?.addEventListener("click", () => sendAction("minimize"));
        document.getElementById("btn-maximize")?.addEventListener("click", () => sendAction("maximize"));
        document.getElementById("btn-close")?.addEventListener("click", () => sendAction("close"));
        document.getElementById("btnMin")?.addEventListener("click", () => sendAction("minimize"));
        document.getElementById("btnMax")?.addEventListener("click", () => sendAction("maximize"));
        document.getElementById("btnClose")?.addEventListener("click", () => sendAction("close"));

        // Declarative tab routing
        const navButtons = document.querySelectorAll("[data-tab], [data-target], [data-view], .nav-item, .tab-btn");
        navButtons.forEach(btn => {
          if (btn.__elix_tab_bound) return;
          btn.__elix_tab_bound = true;
          btn.addEventListener("click", (e) => {
            const targetId = btn.getAttribute("data-tab") || btn.getAttribute("data-target") || btn.getAttribute("data-view") || btn.getAttribute("href")?.replace(/^#/, "");
            if (!targetId) return;
            const container = btn.closest("nav, .sidebar, .tab-bar, .sub-nav, .activity-rail, .nav-tabs, .tabs") || btn.parentElement || document;
            container.querySelectorAll(".nav-item, .tab-btn, button, a").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const parentViewScope = btn.closest(".app-container, .main-container, .center-workspace, .workspace, main, body") || document;
            const views = parentViewScope.querySelectorAll(".view-panel, .tab-content, .panel-view, .view-section, section[id], div[id^=\"view-\"], div[id^=\"tab-\"]");
            views.forEach(view => {
              const isTarget = view.id === targetId || view.id === "view-" + targetId || view.id === "tab-" + targetId || view.getAttribute("data-panel") === targetId || view.getAttribute("data-view") === targetId;
              if (isTarget) {
                view.style.display = "flex";
                view.classList.add("active");
              } else if (view.classList.contains("view-panel") || view.classList.contains("tab-content") || view.classList.contains("panel-view") || view.classList.contains("view-section")) {
                view.style.display = "none";
                view.classList.remove("active");
              }
            });
          });
        });
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindControls);
      } else {
        bindControls();
      }
    })();
  </script>