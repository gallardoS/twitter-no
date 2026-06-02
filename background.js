chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "close-twitter-no-tab" && sender.tab?.id) {
    chrome.tabs.remove(sender.tab.id);
  }
});
