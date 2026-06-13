(function () {
  const ROOT_ID = "twitter-no-root";
  const TIMER_ID = "twitter-no-timer";
  const TIMER_ICON_CLASS = "twitter-no-timer-icon";
  const TIMER_TEXT_CLASS = "twitter-no-timer-text";
  const TIMER_MOVE_INTERVAL_MILLISECONDS = 5000;
  let enabled = false;
  let timerWidgetVisible = true;
  let autoEnableEnabled = false;
  let autoEnableMinutes = 3;
  let timerStartedAt = null;
  let timerIntervalId = null;
  let timerMoveIntervalId = null;
  let timerDragState = null;

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

  function ensureTimerContent(timer) {
    if (timer.querySelector(`.${TIMER_TEXT_CLASS}`)) {
      return;
    }

    const icon = document.createElement("img");
    icon.className = TIMER_ICON_CLASS;
    icon.src = chrome.runtime.getURL("icons/icon32.png");
    icon.alt = "";
    icon.draggable = false;
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = TIMER_TEXT_CLASS;

    timer.replaceChildren(icon, text);
  }

  function updateTimer() {
    if (timerStartedAt === null) {
      timerStartedAt = Date.now();
    }

    const elapsedMilliseconds = Date.now() - timerStartedAt;
    const timer = document.getElementById(TIMER_ID);

    if (timer) {
      ensureTimerContent(timer);

      const timerText = timer.querySelector(`.${TIMER_TEXT_CLASS}`);

      if (timerText) {
        timerText.textContent = formatElapsedTime(elapsedMilliseconds);
      }
    }

    if (autoEnableEnabled && elapsedMilliseconds >= getAutoEnableLimitMilliseconds()) {
      chrome.storage.sync.set({ enabled: true });
    }
  }

  function setTimerPosition(timer, left, top) {
    const timerRect = timer.getBoundingClientRect();
    const maxLeft = Math.max(window.innerWidth - timerRect.width, 0);
    const maxTop = Math.max(window.innerHeight - timerRect.height, 0);
    const safeLeft = Math.min(Math.max(left, 0), maxLeft);
    const safeTop = Math.min(Math.max(top, 0), maxTop);

    timer.style.setProperty("left", `${Math.round(safeLeft)}px`, "important");
    timer.style.setProperty("top", `${Math.round(safeTop)}px`, "important");
  }

  function moveTimerToRandomPosition(timer) {
    if (timerDragState) {
      return;
    }

    const timerRect = timer.getBoundingClientRect();
    const maxLeft = Math.max(window.innerWidth - timerRect.width, 0);
    const maxTop = Math.max(window.innerHeight - timerRect.height, 0);

    setTimerPosition(timer, Math.random() * maxLeft, Math.random() * maxTop);
  }

  function stopTimerDrag(timer, pointerId) {
    if (!timerDragState || timerDragState.pointerId !== pointerId) {
      return;
    }

    timerDragState = null;
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
      timerDragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - timerRect.left,
        offsetY: event.clientY - timerRect.top
      };
      timer.classList.add("twitter-no-timer-dragging");
      timer.setPointerCapture(event.pointerId);
    });
    timer.addEventListener("pointermove", (event) => {
      if (!timerDragState || timerDragState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setTimerPosition(
        timer,
        event.clientX - timerDragState.offsetX,
        event.clientY - timerDragState.offsetY
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

  function startTimer() {
    if (timerIntervalId) {
      return;
    }

    updateTimer();
    timerIntervalId = window.setInterval(() => {
      updateTimer();
    }, 1000);
  }

  function startTimerMovement(timer) {
    if (timerMoveIntervalId) {
      return;
    }

    moveTimerToRandomPosition(timer);
    timerMoveIntervalId = window.setInterval(() => {
      const currentTimer = document.getElementById(TIMER_ID);

      if (currentTimer) {
        moveTimerToRandomPosition(currentTimer);
      }
    }, TIMER_MOVE_INTERVAL_MILLISECONDS);
  }

  function ensureTimerWidget() {
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

    ensureTimerContent(timer);
    ensureTimerDragging(timer);
    updateTimer();
    startTimerMovement(timer);
  }

  function removeTimerWidget() {
    if (timerMoveIntervalId) {
      window.clearInterval(timerMoveIntervalId);
      timerMoveIntervalId = null;
    }

    timerDragState = null;
    document.getElementById(TIMER_ID)?.remove();
  }

  function stopTimer() {
    if (timerIntervalId) {
      window.clearInterval(timerIntervalId);
      timerIntervalId = null;
    }

    timerStartedAt = null;
    removeTimerWidget();
  }

  function removeBlankPage() {
    document.documentElement.classList.remove("twitter-no-active");
    document.getElementById(ROOT_ID)?.remove();
  }

  function applyState(nextEnabled) {
    enabled = Boolean(nextEnabled);

    if (enabled) {
      stopTimer();

      if (document.body) {
        ensureBlankPage();
      }
      return;
    }

    removeBlankPage();
    startTimer();

    if (timerWidgetVisible) {
      ensureTimerWidget();
      return;
    }

    removeTimerWidget();
  }

  chrome.storage.sync.get({
    enabled: true,
    timerWidgetVisible: true,
    autoEnableEnabled: false,
    autoEnableMinutes: 3
  }, ({
    enabled: storedEnabled,
    timerWidgetVisible: storedTimerWidgetVisible,
    autoEnableEnabled: storedAutoEnableEnabled,
    autoEnableMinutes: storedAutoEnableMinutes
  }) => {
    timerWidgetVisible = storedTimerWidgetVisible;
    autoEnableEnabled = storedAutoEnableEnabled;
    autoEnableMinutes = storedAutoEnableMinutes;
    applyState(storedEnabled);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.enabled) {
      applyState(changes.enabled.newValue);
    }

    if (areaName === "sync" && changes.timerWidgetVisible) {
      timerWidgetVisible = changes.timerWidgetVisible.newValue;
      applyState(enabled);
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

    if (!enabled && timerWidgetVisible && !document.getElementById(TIMER_ID)) {
      ensureTimerWidget();
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
