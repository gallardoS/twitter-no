(function () {
  const ROOT_ID = "twitter-no-root";
  const STYLE_ID = "twitter-no-style";
  let enabled = false;

  chrome.storage.sync.get({ noCount: 0 }, ({ noCount }) => {
    chrome.storage.sync.set({ noCount: noCount + 1 });
  });

  chrome.storage.local.get({ accessLog: [] }, ({ accessLog }) => {
    const now = Date.now();
    const maxAge = 1000 * 60 * 60 * 24 * 90;
    const recentAttempts = accessLog
      .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < maxAge)
      .slice(-999);

    chrome.storage.local.set({ accessLog: [...recentAttempts, now] });
  });

  function ensureBlankPage() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        html.twitter-no-active,
        html.twitter-no-active body {
          margin: 0 !important;
          width: 100% !important;
          min-height: 100% !important;
          overflow: hidden !important;
          background: #fff !important;
        }

        html.twitter-no-active body > :not(#${ROOT_ID}) {
          display: none !important;
        }

        #${ROOT_ID} {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          display: grid !important;
          place-items: center !important;
          background: #fff !important;
          color: #000 !important;
          font-family: Helvetica, Arial, sans-serif !important;
          font-weight: 400 !important;
          letter-spacing: 0 !important;
          text-transform: lowercase !important;
        }

        #${ROOT_ID} .twitter-no-word {
          color: #000 !important;
          font-family: Helvetica, Arial, sans-serif !important;
          font-size: 64px !important;
          font-weight: 400 !important;
          line-height: 1 !important;
          letter-spacing: 0 !important;
          user-select: none !important;
        }

        #${ROOT_ID} .twitter-no-close {
          position: absolute !important;
          top: calc(50% + 86px) !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          border: none !important;
          outline: 1px dotted rgb(37, 37, 37) !important;
          outline-offset: -4px !important;
          cursor: pointer !important;
          background: hsl(0deg 0% 75%) !important;
          box-shadow:
            inset -1px -1px #292929,
            inset 1px 1px #fff,
            inset -2px -2px rgb(158, 158, 158),
            inset 2px 2px #ffffff !important;
          color: #000 !important;
          font-family: Helvetica, Arial, sans-serif !important;
          font-size: 14px !important;
          font-weight: 400 !important;
          line-height: 1 !important;
          text-transform: lowercase !important;
          letter-spacing: 2px !important;
          padding: 5px 30px !important;
        }

        #${ROOT_ID} .twitter-no-close:active {
          box-shadow:
            inset -1px -1px #fff,
            inset 1px 1px #292929,
            inset -2px -2px #ffffff,
            inset 2px 2px rgb(158, 158, 158) !important;
        }
      `;
      document.documentElement.appendChild(style);
    }

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("main");
      root.id = ROOT_ID;

      const word = document.createElement("span");
      word.className = "twitter-no-word";
      word.textContent = "no";

      const closeButton = document.createElement("button");
      closeButton.className = "twitter-no-close";
      closeButton.type = "button";
      closeButton.textContent = "ok";
      closeButton.addEventListener("click", () => {
        const runtime = globalThis.chrome?.runtime;

        if (runtime?.sendMessage) {
          runtime.sendMessage({ type: "close-twitter-no-tab" });
          return;
        }

        window.close();
      });

      root.append(word, closeButton);
      document.documentElement.classList.add("twitter-no-active");
      document.body.appendChild(root);
      return;
    }

    document.documentElement.classList.add("twitter-no-active");
  }

  function removeBlankPage() {
    document.documentElement.classList.remove("twitter-no-active");
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  function applyState(nextEnabled) {
    enabled = Boolean(nextEnabled);

    if (enabled) {
      if (document.body) {
        ensureBlankPage();
      }
      return;
    }

    removeBlankPage();
  }

  chrome.storage.sync.get({ enabled: true }, ({ enabled: storedEnabled }) => {
    applyState(storedEnabled);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.enabled) {
      applyState(changes.enabled.newValue);
    }
  });

  const observer = new MutationObserver(() => {
    if (enabled && !document.getElementById(ROOT_ID)) {
      ensureBlankPage();
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
