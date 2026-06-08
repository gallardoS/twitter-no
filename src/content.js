(function () {
  const ROOT_ID = "twitter-no-root";
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
    function clearInteractionArtifacts() {
      window.getSelection()?.removeAllRanges();

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("main");
      root.id = ROOT_ID;
      root.addEventListener("mousedown", (event) => {
        event.preventDefault();
        clearInteractionArtifacts();
      });

      const word = document.createElement("span");
      word.className = "twitter-no-word";
      word.textContent = "no";
      word.setAttribute("unselectable", "on");

      const closeButton = document.createElement("button");
      closeButton.className = "twitter-no-close";
      closeButton.type = "button";
      closeButton.tabIndex = -1;
      closeButton.setAttribute("unselectable", "on");
      closeButton.textContent = "ok";
      closeButton.addEventListener("mousedown", (event) => {
        event.preventDefault();
        clearInteractionArtifacts();
      });
      closeButton.addEventListener("click", () => {
        closeButton.blur();
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
