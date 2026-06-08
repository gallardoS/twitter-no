(function () {
  const ROOT_ID = "twitter-no-root";
  const TIMER_ID = "twitter-no-timer";
  const TIMER_MAX_SIZE_MILLISECONDS = 1000 * 60 * 5;
  let enabled = false;
  let autoEnableEnabled = false;
  let autoEnableMinutes = 3;
  let timerStartedAt = null;
  let timerIntervalId = null;

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

  function formatElapsedTime(elapsedMilliseconds) {
    const totalSeconds = Math.floor(elapsedMilliseconds / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function getAutoEnableLimitMilliseconds() {
    const minutes = Number.parseInt(autoEnableMinutes, 10);
    const safeMinutes = Number.isNaN(minutes) ? 3 : Math.min(Math.max(minutes, 1), 999);

    return safeMinutes * 60 * 1000;
  }

  function updateTimerText(timer) {
    if (timerStartedAt === null) {
      timerStartedAt = Date.now();
    }

    const elapsedMilliseconds = Date.now() - timerStartedAt;
    const timerScale = Math.min(elapsedMilliseconds / TIMER_MAX_SIZE_MILLISECONDS, 1);

    timer.textContent = formatElapsedTime(elapsedMilliseconds);
    timer.style.setProperty("--twitter-no-timer-scale", timerScale.toFixed(3));

    if (autoEnableEnabled && elapsedMilliseconds >= getAutoEnableLimitMilliseconds()) {
      chrome.storage.sync.set({ enabled: true });
    }
  }

  function startTimer(timer) {
    if (timerIntervalId) {
      return;
    }

    updateTimerText(timer);
    timerIntervalId = window.setInterval(() => {
      const currentTimer = document.getElementById(TIMER_ID);

      if (currentTimer) {
        updateTimerText(currentTimer);
      }
    }, 1000);
  }

  function ensureTimer() {
    if (!document.body) {
      return;
    }

    let timer = document.getElementById(TIMER_ID);
    if (!timer) {
      timer = document.createElement("aside");
      timer.id = TIMER_ID;
      timer.setAttribute("aria-label", "time spent on twitter");
      document.body.appendChild(timer);
    }

    startTimer(timer);
  }

  function removeTimer() {
    if (timerIntervalId) {
      window.clearInterval(timerIntervalId);
      timerIntervalId = null;
    }

    timerStartedAt = null;
    document.getElementById(TIMER_ID)?.remove();
  }

  function removeBlankPage() {
    document.documentElement.classList.remove("twitter-no-active");
    document.getElementById(ROOT_ID)?.remove();
  }

  function applyState(nextEnabled) {
    enabled = Boolean(nextEnabled);

    if (enabled) {
      removeTimer();

      if (document.body) {
        ensureBlankPage();
      }
      return;
    }

    removeBlankPage();
    ensureTimer();
  }

  chrome.storage.sync.get({
    enabled: true,
    autoEnableEnabled: false,
    autoEnableMinutes: 3
  }, ({
    enabled: storedEnabled,
    autoEnableEnabled: storedAutoEnableEnabled,
    autoEnableMinutes: storedAutoEnableMinutes
  }) => {
    autoEnableEnabled = storedAutoEnableEnabled;
    autoEnableMinutes = storedAutoEnableMinutes;
    applyState(storedEnabled);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.enabled) {
      applyState(changes.enabled.newValue);
    }

    if (areaName === "sync" && changes.autoEnableEnabled) {
      autoEnableEnabled = changes.autoEnableEnabled.newValue;
    }

    if (areaName === "sync" && changes.autoEnableMinutes) {
      autoEnableMinutes = changes.autoEnableMinutes.newValue;
    }
  });

  const observer = new MutationObserver(() => {
    if (enabled && !document.getElementById(ROOT_ID)) {
      ensureBlankPage();
    }

    if (!enabled && !document.getElementById(TIMER_ID)) {
      ensureTimer();
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
