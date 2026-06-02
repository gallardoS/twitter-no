const checkbox = document.getElementById("enabled");
const statusText = document.getElementById("status");
const noCountText = document.getElementById("no-count");
const noCountWeekText = document.getElementById("no-count-week");
const closePopupButton = document.getElementById("close-popup");
const weekChart = document.getElementById("week-chart");
const copyChartButton = document.getElementById("copy-chart");
const dayLabels = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
let currentAccessLog = [];

function getWeekStart(date) {
  const start = new Date(date);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dayOffset);
  return start;
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);

  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });

  return element;
}

function render(enabled) {
  checkbox.checked = enabled;
  statusText.textContent = enabled ? "on" : "off";
}

function renderWeekChart(accessLog = []) {
  currentAccessLog = accessLog;
  const width = 320;
  const height = 288;
  const padding = { top: 12, right: 10, bottom: 24, left: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const weekStart = getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const attempts = accessLog
    .filter((timestamp) => Number.isFinite(timestamp))
    .map((timestamp) => new Date(timestamp))
    .filter((date) => date >= weekStart && date < weekEnd);

  noCountWeekText.textContent = attempts.length;
  weekChart.replaceChildren();

  for (let day = 0; day < 7; day += 1) {
    const x = padding.left + (plotWidth / 6) * day;
    weekChart.append(createSvgElement("line", {
      class: "chart-grid",
      x1: x,
      y1: padding.top,
      x2: x,
      y2: padding.top + plotHeight
    }));

    const label = createSvgElement("text", {
      class: "chart-label",
      x,
      y: height - 8,
      "text-anchor": "middle"
    });
    label.textContent = dayLabels[day];
    weekChart.append(label);
  }

  Array.from({ length: 25 }, (_, hour) => hour).forEach((hour) => {
    const y = padding.top + (plotHeight / 24) * hour;
    weekChart.append(createSvgElement("line", {
      class: "chart-grid",
      x1: padding.left,
      y1: y,
      x2: padding.left + plotWidth,
      y2: y
    }));

    const label = createSvgElement("text", {
      class: "chart-label",
      x: padding.left - 5,
      y: y + 3,
      "text-anchor": "end"
    });
    label.textContent = String(hour).padStart(2, "0");
    weekChart.append(label);
  });

  weekChart.append(createSvgElement("line", {
    class: "chart-axis",
    x1: padding.left,
    y1: padding.top,
    x2: padding.left,
    y2: padding.top + plotHeight
  }));
  weekChart.append(createSvgElement("line", {
    class: "chart-axis",
    x1: padding.left,
    y1: padding.top + plotHeight,
    x2: padding.left + plotWidth,
    y2: padding.top + plotHeight
  }));

  if (attempts.length === 0) {
    const empty = createSvgElement("text", {
      class: "chart-empty",
      x: padding.left + plotWidth / 2,
      y: padding.top + plotHeight / 2,
      "text-anchor": "middle"
    });
    empty.textContent = "no attempts this week";
    weekChart.append(empty);
    return;
  }

  const buckets = attempts.reduce((bucketMap, date) => {
    const day = (date.getDay() + 6) % 7;
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    const current = bucketMap.get(key) ?? { day, hour, count: 0 };

    current.count += 1;
    bucketMap.set(key, current);
    return bucketMap;
  }, new Map());
  const maxCount = Math.max(...Array.from(buckets.values(), ({ count }) => count));

  buckets.forEach(({ day, hour, count }) => {
    const intensity = count / maxCount;
    const lightness = Math.round(78 - intensity * 58);
    const radius = 3 + Math.min(count - 1, 5);
    const x = padding.left + (plotWidth / 6) * day;
    const y = padding.top + (plotHeight / 24) * (hour + 0.5);

    weekChart.append(createSvgElement("circle", {
      class: "chart-point",
      cx: x,
      cy: y,
      r: radius,
      fill: `hsl(240deg 80% ${lightness}%)`
    }));
  });
}

function getThisWeekAttempts(accessLog) {
  const weekStart = getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  return accessLog
    .filter((timestamp) => Number.isFinite(timestamp))
    .map((timestamp) => new Date(timestamp))
    .filter((date) => date >= weekStart && date < weekEnd);
}

function getAttemptBuckets(attempts) {
  const buckets = attempts.reduce((bucketMap, date) => {
    const day = (date.getDay() + 6) % 7;
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    const current = bucketMap.get(key) ?? { day, hour, count: 0 };

    current.count += 1;
    bucketMap.set(key, current);
    return bucketMap;
  }, new Map());

  return {
    buckets,
    maxCount: Math.max(1, ...Array.from(buckets.values(), ({ count }) => count))
  };
}

function drawWin95Rect(context, x, y, width, height) {
  context.fillStyle = "#c0c0c0";
  context.fillRect(x, y, width, height);
  context.strokeStyle = "#ffffff";
  context.beginPath();
  context.moveTo(x, y + height - 1);
  context.lineTo(x, y);
  context.lineTo(x + width - 1, y);
  context.stroke();
  context.strokeStyle = "#404040";
  context.beginPath();
  context.moveTo(x + width - 1, y);
  context.lineTo(x + width - 1, y + height - 1);
  context.lineTo(x, y + height - 1);
  context.stroke();
}

function drawCopiedChart(context, accessLog) {
  const width = 344;
  const height = 331;
  const chart = { x: 14, y: 43, width: 317, height: 274 };
  const padding = { top: 10, right: 10, bottom: 25, left: 29 };
  const plotX = chart.x + padding.left;
  const plotY = chart.y + padding.top;
  const plotWidth = chart.width - padding.left - padding.right;
  const plotHeight = chart.height - padding.top - padding.bottom;
  const attempts = getThisWeekAttempts(accessLog);
  const { buckets, maxCount } = getAttemptBuckets(attempts);

  context.imageSmoothingEnabled = false;
  context.fillStyle = "#c0c0c0";
  context.fillRect(0, 0, width, height);

  drawWin95Rect(context, 0, 0, width, height);

  context.fillStyle = "#000080";
  context.fillRect(4, 4, width - 8, 19);
  context.fillStyle = "#ffffff";
  context.font = "bold 11px Arial";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("this-week", 8, 17);
  context.textAlign = "right";
  context.fillText("twitter-no", width - 8, 17);

  context.fillStyle = "#ffffff";
  context.fillRect(chart.x, chart.y, chart.width, chart.height);
  context.strokeStyle = "#404040";
  context.strokeRect(chart.x, chart.y, chart.width, chart.height);

  context.strokeStyle = "#d8d8d8";
  context.lineWidth = 1;

  for (let day = 0; day < 7; day += 1) {
    const x = Math.round(plotX + (plotWidth / 6) * day) + 0.5;
    context.beginPath();
    context.moveTo(x, plotY);
    context.lineTo(x, plotY + plotHeight);
    context.stroke();
  }

  for (let hour = 0; hour <= 24; hour += 1) {
    const y = Math.round(plotY + (plotHeight / 24) * hour) + 0.5;
    context.beginPath();
    context.moveTo(plotX, y);
    context.lineTo(plotX + plotWidth, y);
    context.stroke();
  }

  context.strokeStyle = "#000000";
  context.beginPath();
  context.moveTo(plotX + 0.5, plotY);
  context.lineTo(plotX + 0.5, plotY + plotHeight + 0.5);
  context.lineTo(plotX + plotWidth, plotY + plotHeight + 0.5);
  context.stroke();

  context.fillStyle = "#000000";
  context.font = "8px Arial";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let hour = 0; hour <= 24; hour += 1) {
    const y = plotY + (plotHeight / 24) * hour;
    context.fillText(String(hour).padStart(2, "0"), plotX - 6, y);
  }

  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  dayLabels.forEach((label, day) => {
    const x = plotX + (plotWidth / 6) * day;
    context.fillText(label, x, chart.y + chart.height - 7);
  });

  buckets.forEach(({ day, hour, count }) => {
    const intensity = count / maxCount;
    const lightness = Math.round(78 - intensity * 58);
    const radius = 3 + Math.min(count - 1, 5);
    const x = plotX + (plotWidth / 6) * day;
    const y = plotY + (plotHeight / 24) * (hour + 0.5);

    context.fillStyle = `hsl(240deg 80% ${lightness}%)`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  });

  if (attempts.length === 0) {
    context.fillStyle = "#606060";
    context.font = "10px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("no attempts this week", plotX + plotWidth / 2, plotY + plotHeight / 2);
  }
}

function getCanvasBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
}

async function copyChartImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 344;
  canvas.height = 331;
  drawCopiedChart(canvas.getContext("2d"), currentAccessLog);

  const blob = await getCanvasBlob(canvas);

  if (!blob || !navigator.clipboard?.write || !globalThis.ClipboardItem) {
    throw new Error("image clipboard is not available");
  }

  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob })
  ]);
}

chrome.storage.sync.get({ enabled: true, noCount: 0 }, ({ enabled, noCount }) => {
  render(enabled);
  noCountText.textContent = noCount;
});

chrome.storage.local.get({ accessLog: [] }, ({ accessLog }) => {
  renderWeekChart(accessLog);
});

checkbox.addEventListener("change", () => {
  const enabled = checkbox.checked;
  chrome.storage.sync.set({ enabled });
  render(enabled);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.noCount) {
    noCountText.textContent = changes.noCount.newValue;
  }

  if (areaName === "local" && changes.accessLog) {
    renderWeekChart(changes.accessLog.newValue);
  }
});

closePopupButton.addEventListener("click", () => {
  window.close();
});

copyChartButton.addEventListener("click", async () => {
  copyChartButton.textContent = "copying";

  try {
    await copyChartImage();
    copyChartButton.textContent = "copied to clipboard";
  } catch {
    copyChartButton.textContent = "error";
  }

  setTimeout(() => {
    copyChartButton.textContent = "photo";
  }, 1200);
});
