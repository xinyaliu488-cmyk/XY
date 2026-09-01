const statusNode = document.querySelector("#status");
const button = document.querySelector("#sync");

async function refreshStatus() {
  const state = await chrome.storage.local.get(["status", "message", "lastSyncAt", "count"]);
  statusNode.textContent = state.message || "等待首次同步";
  if (state.lastSyncAt) statusNode.textContent += "\n" + new Date(state.lastSyncAt).toLocaleString("zh-CN");
}

button.addEventListener("click", async () => {
  button.disabled = true;
  statusNode.textContent = "正在启动同步…";
  await chrome.runtime.sendMessage({ type: "SYNC_NOW" });
  setTimeout(() => {
    button.disabled = false;
    refreshStatus();
  }, 1500);
});

refreshStatus();
