const CITY = "101020100";
const QUERY = "前端 React";

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SCRAPE_JOBS") scrapeAndSend();
});

if (/\/web\/geek\/jobs/.test(location.pathname)) setTimeout(scrapeAndSend, 3500);

function text(root, selectors) {
  for (const selector of selectors) {
    const found = root.querySelector(selector);
    const value = found && found.textContent && found.textContent.trim();
    if (value) return value;
  }
  return "";
}

function parseSalary(value) {
  const matches = Array.from(String(value || "").matchAll(/(\d+(?:\.\d+)?)\s*k/gi)).map((match) => Number(match[1]));
  return { minSalary: matches[0] || 0, maxSalary: matches[1] || matches[0] || 0 };
}

function extractCards() {
  const selectors = [".job-card-wrapper", ".job-card-box", ".job-list-box li", "li[class*='job-card']"];
  const cards = Array.from(new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))));
  return cards.map((card) => {
    const link = card.querySelector("a[href*='/job_detail/']");
    if (!link) return null;
    const title = text(card, [".job-name", ".job-title", "a[href*='/job_detail/']"]);
    const company = text(card, [".company-name", ".company-text", "a[href*='/gongsi/']"]);
    const locationText = text(card, [".job-area", ".job-location", "[class*='area']"]);
    const salary = parseSalary(text(card, [".salary", "[class*='salary']"]));
    const tags = Array.from(card.querySelectorAll("li, [class*='tag']"))
      .map((node) => node.textContent.trim())
      .filter((value) => value && value.length < 24)
      .slice(0, 8);
    const href = new URL(link.getAttribute("href"), location.origin).toString();
    const match = href.match(/job_detail\/([^./?]+)/);
    const id = match ? match[1] : btoa(href).slice(0, 16);
    return {
      id: "boss-" + id,
      title: title || "未命名职位",
      company: company || "未知公司",
      source: "boss",
      location: locationText || "上海",
      remote: tags.slice(0, 2).join(" · ") || "以职位页为准",
      minSalary: salary.minSalary,
      maxSalary: salary.maxSalary,
      postedHours: 1,
      skills: tags,
      summary: tags.join(" · ") || "来自 BOSS 直聘当前搜索结果。",
      url: href,
      fetchedAt: new Date().toISOString()
    };
  }).filter(Boolean);
}

async function scrapeAndSend() {
  const body = document.body && document.body.innerText || "";
  if (/安全验证|异常访问|请完成.*验证/.test(body)) {
    await chrome.storage.local.set({ status: "verification", message: "BOSS 需要安全验证，验证后会自动继续" });
    return;
  }
  const jobs = extractCards();
  if (!jobs.length) {
    await chrome.storage.local.set({ status: "waiting", message: "页面尚未加载职位，稍后重试" });
    return;
  }
  await chrome.runtime.sendMessage({ type: "IMPORT_JOBS", payload: { query: QUERY, city: CITY, jobs } });
}
