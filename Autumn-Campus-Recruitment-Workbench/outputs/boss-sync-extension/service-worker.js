const SEARCH_URL = "https://www.zhipin.com/web/geek/jobs?query=%E5%89%8D%E7%AB%AF%20React&city=101020100";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("boss-sync", { periodInMinutes: 30 });
  chrome.storage.local.set({ status: "ready", message: "等待首次同步" });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "boss-sync") syncNow();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SYNC_NOW") {
    syncNow().then(sendResponse);
    return true;
  }
  if (message.type === "IMPORT_JOBS") {
    importJobs(message.payload).then(sendResponse);
    return true;
  }
});

async function syncNow() {
  await chrome.storage.local.set({ status: "syncing", message: "正在读取 BOSS 职位" });
  const tabs = await chrome.tabs.query({ url: "https://www.zhipin.com/web/geek/*" });
  let tab = tabs.find((item) => item.url && item.url.includes("/jobs"));
  if (!tab) tab = await chrome.tabs.create({ url: SEARCH_URL, active: false });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_JOBS" });
    return { accepted: true };
  } catch {
    await chrome.tabs.update(tab.id, { url: SEARCH_URL });
    await chrome.storage.local.set({ status: "waiting", message: "已打开 BOSS 搜索页，页面加载后会自动同步" });
    return { accepted: true, waiting: true };
  }
}

async function importJobs(payload) {
  try {
    const response = await fetch("http://127.0.0.1:4173/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "导入失败");
    await chrome.storage.local.set({
      status: "ok",
      message: "已同步 " + result.count + " 条真实岗位",
      lastSyncAt: result.fetchedAt,
      count: result.count
    });
    return result;
  } catch (error) {
    await chrome.storage.local.set({ status: "error", message: error.message });
    return { accepted: false, error: error.message };
  }
}
