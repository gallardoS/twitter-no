(function () {
  const ROOT_ID = "twitter-no-root";
  const TIMER_ID = "twitter-no-timer";
  const TIMER_ICON_CLASS = "twitter-no-timer-icon";
  const TIMER_TEXT_CLASS = "twitter-no-timer-text";
  const TIMER_ICON_PATH = "icons/icon32.png";
  const TIMER_TICK_INTERVAL_MILLISECONDS = 1000;
  const TIMER_MOVE_INTERVAL_MILLISECONDS = 5000;
  const ACCESS_LOG_MAX_AGE_MILLISECONDS = 1000 * 60 * 60 * 24 * 90;
  const ACCESS_LOG_LIMIT = 999;
  const DEFAULT_SETTINGS = {
    enabled: true,
    timerWidgetVisible: true,
    autoEnableEnabled: false,
    autoEnableMinutes: 3
  };

  const state = {
    enabled: false,
    timerWidgetVisible: DEFAULT_SETTINGS.timerWidgetVisible,
    autoEnableEnabled: DEFAULT_SETTINGS.autoEnableEnabled,
    autoEnableMinutes: DEFAULT_SETTINGS.autoEnableMinutes,
    timerStartedAt: null,
    timerIntervalId: null,
    timerMoveIntervalId: null,
    timerDragState: null
  };

  recordNoCount();
  recordAccessAttempt();
  loadSettings();
  observePageIntegrity();
  observeSettings();

  function recordNoCount() {
    chrome.storage.sync.get({ noCount: 0 }, ({ noCount }) => {
      chrome.storage.sync.set({ noCount: noCount + 1 });
    });
  }

  function recordAccessAttempt() {
    chrome.storage.local.get({ accessLog: [] }, ({ accessLog }) => {
      const now = Date.now();
      const recentAttempts = accessLog
        .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < ACCESS_LOG_MAX_AGE_MILLISECONDS)
        .slice(-ACCESS_LOG_LIMIT);

      chrome.storage.local.set({ accessLog: [...recentAttempts, now] });
    });
  }

  function clearInteractionArtifacts() {
    window.getSelection()?.removeAllRanges();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function createCloseButton() {
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

    return closeButton;
  }

  function createBlankPage() {
    const root = document.createElement("main");
    root.id = ROOT_ID;
    root.addEventListener("mousedown", (event) => {
      event.preventDefault();
      clearInteractionArtifacts();
    });

    const word = document.createElement("span");
    word.className = "twitter-no-word";
    word.textContent = "no";
    word.setAttribute("unselectable", "on");

    root.append(word, createCloseButton());
    return root;
  }

  function ensureBlankPage() {
    if (!document.body) {
      return;
    }

    if (!document.getElementById(ROOT_ID)) {
      document.body.appendChild(createBlankPage());
    }

    document.documentElement.classList.add("twitter-no-active");
  }

  function removeBlankPage() {
    document.documentElement.classList.remove("twitter-no-active");
    document.getElementById(ROOT_ID)?.remove();
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
    const minutes = Number.parseInt(state.autoEnableMinutes, 10);
    const safeMinutes = Number.isNaN(minutes) ? 3 : Math.min(Math.max(minutes, 1), 999);

    return safeMinutes * 60 * 1000;
  }

  function getElapsedMilliseconds() {
    if (state.timerStartedAt === null) {
      state.timerStartedAt = Date.now();
    }

    return Date.now() - state.timerStartedAt;
  }

  function maybeAutoEnable(elapsedMilliseconds) {
    if (state.autoEnableEnabled && elapsedMilliseconds >= getAutoEnableLimitMilliseconds()) {
      chrome.storage.sync.set({ enabled: true });
    }
  }

  function renderTimerWidgetText(elapsedMilliseconds) {
    const timer = document.getElementById(TIMER_ID);

    if (!timer) {
      return;
    }

    ensureTimerContent(timer);

    const timerText = timer.querySelector(`.${TIMER_TEXT_CLASS}`);

    if (timerText) {
      timerText.textContent = formatElapsedTime(elapsedMilliseconds);
    }
  }

  function updateTimerSession() {
    const elapsedMilliseconds = getElapsedMilliseconds();

    renderTimerWidgetText(elapsedMilliseconds);
    maybeAutoEnable(elapsedMilliseconds);
  }

  function startTimerSession() {
    if (state.timerIntervalId) {
      return;
    }

    updateTimerSession();
    state.timerIntervalId = window.setInterval(updateTimerSession, TIMER_TICK_INTERVAL_MILLISECONDS);
  }

  function stopTimerSession() {
    if (state.timerIntervalId) {
      window.clearInterval(state.timerIntervalId);
      state.timerIntervalId = null;
    }

    state.timerStartedAt = null;
    removeTimerWidget();
  }

  function createTimerWidget() {
    const timer = document.createElement("aside");
    timer.id = TIMER_ID;
    timer.setAttribute("aria-label", "time spent on twitter");
    ensureTimerContent(timer);
    ensureTimerDragging(timer);

    return timer;
  }

  function ensureTimerContent(timer) {
    if (timer.querySelector(`.${TIMER_TEXT_CLASS}`)) {
      return;
    }

    const icon = document.createElement("img");
    icon.className = TIMER_ICON_CLASS;
    icon.src = chrome.runtime.getURL(TIMER_ICON_PATH);
    icon.alt = "";
    icon.draggable = false;
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = TIMER_TEXT_CLASS;

    timer.replaceChildren(icon, text);
  }

  function ensureTimerWidget() {
    if (!document.body) {
      return;
    }

    let timer = document.getElementById(TIMER_ID);

    if (!timer) {
      timer = createTimerWidget();
      document.body.appendChild(timer);
    }

    ensureTimerContent(timer);
    ensureTimerDragging(timer);
    renderTimerWidgetText(getElapsedMilliseconds());
    startTimerMovement(timer);
  }

  function removeTimerWidget() {
    stopTimerMovement();
    state.timerDragState = null;
    document.getElementById(TIMER_ID)?.remove();
  }

  function stopTimerMovement() {
    if (state.timerMoveIntervalId) {
      window.clearInterval(state.timerMoveIntervalId);
      state.timerMoveIntervalId = null;
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getTimerPositionBounds(timer) {
    const timerRect = timer.getBoundingClientRect();

    return {
      maxLeft: Math.max(window.innerWidth - timerRect.width, 0),
      maxTop: Math.max(window.innerHeight - timerRect.height, 0)
    };
  }

  function setTimerPosition(timer, left, top) {
    const { maxLeft, maxTop } = getTimerPositionBounds(timer);
    const safeLeft = clamp(left, 0, maxLeft);
    const safeTop = clamp(top, 0, maxTop);

    timer.style.setProperty("left", `${Math.round(safeLeft)}px`, "important");
    timer.style.setProperty("top", `${Math.round(safeTop)}px`, "important");
  }

  function moveTimerToRandomPosition(timer) {
    if (state.timerDragState) {
      return;
    }

    const { maxLeft, maxTop } = getTimerPositionBounds(timer);

    setTimerPosition(timer, Math.random() * maxLeft, Math.random() * maxTop);
  }

  function startTimerMovement(timer) {
    if (state.timerMoveIntervalId) {
      return;
    }

    moveTimerToRandomPosition(timer);
    state.timerMoveIntervalId = window.setInterval(() => {
      const currentTimer = document.getElementById(TIMER_ID);

      if (currentTimer) {
        moveTimerToRandomPosition(currentTimer);
      }
    }, TIMER_MOVE_INTERVAL_MILLISECONDS);
  }

  function stopTimerDrag(timer, pointerId) {
    if (!state.timerDragState || state.timerDragState.pointerId !== pointerId) {
      return;
    }

    state.timerDragState = null;
    timer.classList.remove("twitter-no-timer-dragging");
  }

  function ensureTimerDragging(timer) {
    if (timer.dataset.twitterNoDragReady === "true") {
      return;
    }

    timer.dataset.twitterNoDragReady = "true";
    timer.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const timerRect = timer.getBoundingClientRect();

      event.preventDefault();
      event.stopPropagation();
      state.timerDragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - timerRect.left,
        offsetY: event.clientY - timerRect.top
      };
      timer.classList.add("twitter-no-timer-dragging");
      timer.setPointerCapture(event.pointerId);
    });
    timer.addEventListener("pointermove", (event) => {
      if (!state.timerDragState || state.timerDragState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setTimerPosition(
        timer,
        event.clientX - state.timerDragState.offsetX,
        event.clientY - state.timerDragState.offsetY
      );
    });
    timer.addEventListener("pointerup", (event) => {
      stopTimerDrag(timer, event.pointerId);
    });
    timer.addEventListener("pointercancel", (event) => {
      stopTimerDrag(timer, event.pointerId);
    });
    timer.addEventListener("lostpointercapture", (event) => {
      stopTimerDrag(timer, event.pointerId);
    });
  }

  function syncTimerWidgetVisibility() {
    if (!state.enabled && state.timerWidgetVisible) {
      ensureTimerWidget();
      return;
    }

    removeTimerWidget();
  }

  function enterBlockingMode() {
    stopTimerSession();
    ensureBlankPage();
  }

  function enterAllowedMode() {
    removeBlankPage();
    startTimerSession();
    syncTimerWidgetVisibility();
  }

  function applyState(nextEnabled) {
    state.enabled = Boolean(nextEnabled);

    if (state.enabled) {
      enterBlockingMode();
      return;
    }

    enterAllowedMode();
  }

  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, ({
      enabled,
      timerWidgetVisible,
      autoEnableEnabled,
      autoEnableMinutes
    }) => {
      state.timerWidgetVisible = timerWidgetVisible;
      state.autoEnableEnabled = autoEnableEnabled;
      state.autoEnableMinutes = autoEnableMinutes;
      applyState(enabled);
    });
  }

  function observeSettings() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      if (changes.enabled) {
        applyState(changes.enabled.newValue);
      }

      if (changes.timerWidgetVisible) {
        state.timerWidgetVisible = changes.timerWidgetVisible.newValue;
        syncTimerWidgetVisibility();
      }

      if (changes.autoEnableEnabled) {
        state.autoEnableEnabled = changes.autoEnableEnabled.newValue;
      }

      if (changes.autoEnableMinutes) {
        state.autoEnableMinutes = changes.autoEnableMinutes.newValue;
      }
    });
  }

  function observePageIntegrity() {
    const observer = new MutationObserver(() => {
      if (state.enabled && !document.getElementById(ROOT_ID)) {
        ensureBlankPage();
      }

      if (!state.enabled && state.timerWidgetVisible && !document.getElementById(TIMER_ID)) {
        ensureTimerWidget();
      }
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
})();
