const jobSources = [
  { id: "linkedin", name: "LinkedIn", status: "未接入", color: "#246bfe" },
  { id: "boss", name: "BOSS 直聘", status: "加载中", color: "#1d8f63" },
  { id: "lagou", name: "拉勾", status: "限流", color: "#a86b00" },
  { id: "liepin", name: "猎聘", status: "正常", color: "#b3261e" },
  { id: "job51", name: "前程无忧", status: "正常", color: "#5b5bd6" }
];

const demoJobs = [
  {
    id: 1,
    title: "高级前端工程师",
    company: "Nebula CRM",
    source: "linkedin",
    location: "上海",
    remote: "混合办公",
    minSalary: 35,
    maxSalary: 55,
    postedHours: 2,
    skills: ["React", "TypeScript", "SaaS", "A/B 测试"],
    summary: "负责销售工作台、增长实验和企业级组件体系，要求能把复杂业务流程做得稳定且清晰。"
  },
  {
    id: 2,
    title: "React 全栈开发工程师",
    company: "墨曜智能",
    source: "boss",
    location: "上海",
    remote: "到岗",
    minSalary: 28,
    maxSalary: 45,
    postedHours: 6,
    skills: ["React", "Node.js", "TypeScript", "数据可视化"],
    summary: "参与 AI 招聘产品的前端体验和 Node 服务开发，偏重工程效率、权限和数据面板。"
  },
  {
    id: 3,
    title: "数据可视化前端专家",
    company: "星河数据",
    source: "liepin",
    location: "北京",
    remote: "远程可谈",
    minSalary: 40,
    maxSalary: 65,
    postedHours: 18,
    skills: ["数据可视化", "React", "D3", "英语沟通"],
    summary: "建设跨区域业务洞察平台，需要把大型数据集、图表性能和叙事式分析结合起来。"
  },
  {
    id: 4,
    title: "Web 产品工程师",
    company: "FlowOps",
    source: "lagou",
    location: "深圳",
    remote: "混合办公",
    minSalary: 25,
    maxSalary: 38,
    postedHours: 9,
    skills: ["React", "SaaS", "产品思维", "TypeScript"],
    summary: "面向海外客户打造运营协作工具，团队希望候选人能参与需求拆解和体验打磨。"
  },
  {
    id: 5,
    title: "Node.js 后端工程师",
    company: "简云科技",
    source: "job51",
    location: "上海",
    remote: "到岗",
    minSalary: 24,
    maxSalary: 36,
    postedHours: 30,
    skills: ["Node.js", "TypeScript", "微服务", "MySQL"],
    summary: "负责招聘数据采集、清洗、去重和搜索接口，熟悉队列与定时任务会很加分。"
  },
  {
    id: 6,
    title: "前端架构师",
    company: "Aster Cloud",
    source: "linkedin",
    location: "远程",
    remote: "全远程",
    minSalary: 45,
    maxSalary: 70,
    postedHours: 4,
    skills: ["React", "TypeScript", "微前端", "英语沟通"],
    summary: "服务全球 SaaS 产品线，负责架构治理、设计系统落地和跨时区技术沟通。"
  },
  {
    id: 7,
    title: "增长前端工程师",
    company: "青衡教育",
    source: "boss",
    location: "杭州",
    remote: "混合办公",
    minSalary: 22,
    maxSalary: 34,
    postedHours: 13,
    skills: ["React", "A/B 测试", "埋点", "数据分析"],
    summary: "负责投放落地页、转化漏斗、用户实验平台和增长指标的前端建设。"
  },
  {
    id: 8,
    title: "海外业务前端开发",
    company: "Northstar Pay",
    source: "liepin",
    location: "上海",
    remote: "混合办公",
    minSalary: 32,
    maxSalary: 48,
    postedHours: 22,
    skills: ["React", "英语沟通", "支付", "TypeScript"],
    summary: "支持跨境支付后台与商户门户，要求英文文档协作能力和稳定的工程交付。"
  }
];

let jobs = [];
let bossMeta = { status: "loading" };

const state = {
  selectedSources: new Set(jobSources.map((source) => source.id)),
  savedSearches: JSON.parse(localStorage.getItem("joblens_saved_searches") || "[]"),
  resumeSkills: [],
  timerId: null,
  refreshRound: 0,
  syncRunning: false
};

const elements = {
  query: document.querySelector("#query"),
  location: document.querySelector("#location"),
  salary: document.querySelector("#salary"),
  sortBy: document.querySelector("#sortBy"),
  jobList: document.querySelector("#jobList"),
  resultCount: document.querySelector("#resultCount"),
  avgMatch: document.querySelector("#avgMatch"),
  sourceCount: document.querySelector("#sourceCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  sourceList: document.querySelector("#sourceList"),
  savedList: document.querySelector("#savedList"),
  resumeText: document.querySelector("#resumeText"),
  skillChips: document.querySelector("#skillChips"),
  syncText: document.querySelector("#syncText"),
  autoRefresh: document.querySelector("#autoRefresh"),
  template: document.querySelector("#jobCardTemplate")
};

function normalize(value) {
  return value.trim().toLowerCase();
}

function parseResumeSkills() {
  state.resumeSkills = elements.resumeText.value
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  renderSkillChips();
}

function calculateMatch(job) {
  if (state.resumeSkills.length === 0) return 0;
  const matched = job.skills.filter((skill) =>
    state.resumeSkills.some((resumeSkill) => normalize(skill) === normalize(resumeSkill))
  );
  const baseScore = Math.round((matched.length / Math.max(job.skills.length, 1)) * 82);
  const sourceStatus = jobSources.find((source) => source.id === job.source)?.status;
  const sourceBonus = ["正常", "已采集", "演示"].includes(sourceStatus) ? 8 : 0;
  const freshnessBonus = job.postedHours <= 8 ? 10 : job.postedHours <= 24 ? 6 : 2;
  return Math.min(99, baseScore + sourceBonus + freshnessBonus);
}

function getFilteredJobs() {
  const queryTerms = normalize(elements.query.value).split(/\s+/).filter(Boolean);
  const location = normalize(elements.location.value);
  const minSalary = Number(elements.salary.value);

  return jobs
    .map((job) => ({ ...job, match: calculateMatch(job) }))
    .filter((job) => state.selectedSources.has(job.source))
    .filter((job) => {
      const searchable = [job.title, job.company, job.location, job.remote, job.summary, ...job.skills].join(" ").toLowerCase();
      return queryTerms.length === 0 || queryTerms.every((term) => searchable.includes(term));
    })
    .filter((job) => !location || job.location.toLowerCase().includes(location) || job.remote.toLowerCase().includes(location))
    .filter((job) => job.minSalary === 0 || job.minSalary >= minSalary)
    .sort((a, b) => {
      if (elements.sortBy.value === "salary") return b.maxSalary - a.maxSalary;
      if (elements.sortBy.value === "fresh") return a.postedHours - b.postedHours;
      return b.match - a.match;
    });
}

function renderJobs() {
  const filtered = getFilteredJobs();
  elements.jobList.innerHTML = "";

  if (filtered.length === 0) {
    const status = bossMeta.status;
    const message = status === "access_restricted"
      ? "BOSS 直聘暂未返回职位：当前访问环境受限。请先在 BOSS 直聘完成登录/验证，再重新采集。"
      : status === "manual_verification_required"
        ? "BOSS 直聘需要登录或人工验证。完成验证后重新采集即可显示真实岗位。"
        : status === "browser_launch_failed"
          ? "采集浏览器未能启动，请使用可用浏览器会话重新采集。"
          : status === "loading"
            ? "正在加载最新 BOSS 直聘职位。"
            : "当前没有真实 BOSS 直聘职位数据。";
    elements.jobList.innerHTML = '<div class="no-results">' + message + '</div>';
  }

  filtered.forEach((job) => {
    const source = jobSources.find((item) => item.id === job.source);
    const card = elements.template.content.firstElementChild.cloneNode(true);
    card.querySelector(".company-logo").textContent = job.company.slice(0, 2).toUpperCase();
    card.querySelector(".company-logo").style.background = `${source.color}18`;
    card.querySelector(".company-logo").style.color = source.color;
    card.querySelector("h3").textContent = job.title;
    card.querySelector(".company-line").textContent = `${job.company} · ${source.name} · ${job.location} · ${job.remote}`;
    card.querySelector(".match-pill").textContent = `${job.match}% 匹配`;
    card.querySelector(".job-summary").textContent = job.summary;
    card.querySelector(".salary").textContent = job.minSalary > 0
      ? `${job.minSalary}k-${job.maxSalary}k / 月`
      : "薪资待补充";
    card.querySelector(".posted").textContent = job.fetchedAt ? "BOSS 采集数据" : `${job.postedHours + state.refreshRound} 小时内更新`;
    card.querySelector(".apply-link").href = job.url || `https://www.google.com/search?q=${encodeURIComponent(`${job.company} ${job.title} ${source.name}`)}`;

    const tagRow = card.querySelector(".tag-row");
    job.skills.forEach((skill) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = skill;
      tagRow.append(tag);
    });

    elements.jobList.append(card);
  });

  const avg = filtered.length
    ? Math.round(filtered.reduce((sum, job) => sum + job.match, 0) / filtered.length)
    : 0;
  elements.resultCount.textContent = filtered.length;
  elements.avgMatch.textContent = `${avg}%`;
  elements.sourceCount.textContent = state.selectedSources.size;
  elements.lastUpdated.textContent = bossMeta.fetchedAt
    ? new Date(bossMeta.fetchedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "--:--";
}

function renderSkillChips() {
  elements.skillChips.innerHTML = "";
  const currentResults = getFilteredJobs();
  const resultSkills = new Set(currentResults.flatMap((job) => job.skills.map(normalize)));

  state.resumeSkills.forEach((skill) => {
    const chip = document.createElement("span");
    chip.className = `skill-chip ${resultSkills.has(normalize(skill)) ? "active" : ""}`;
    chip.textContent = skill;
    elements.skillChips.append(chip);
  });
}

function renderSources() {
  elements.sourceList.innerHTML = "";
  jobSources.forEach((source) => {
    const row = document.createElement("div");
    row.className = "source-row";
    row.innerHTML = `
      <label>
        <input type="checkbox" data-source="${source.id}" ${state.selectedSources.has(source.id) ? "checked" : ""} />
        <span>${source.name}</span>
      </label>
      <span class="source-status">${source.status}</span>
    `;
    elements.sourceList.append(row);
  });
}

function renderSavedSearches() {
  elements.savedList.innerHTML = "";
  if (state.savedSearches.length === 0) {
    elements.savedList.className = "saved-list empty-state";
    elements.savedList.textContent = "还没有保存的搜索";
    return;
  }

  elements.savedList.className = "saved-list";
  state.savedSearches.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "saved-row";
    row.innerHTML = `
      <div>
        <strong>${item.query || "不限关键词"}</strong>
        <span>${item.location || "不限地点"} · ${item.salaryLabel}</span>
      </div>
      <button type="button" aria-label="删除保存搜索" data-remove="${index}">×</button>
    `;
    row.querySelector("div").addEventListener("click", () => {
      elements.query.value = item.query;
      elements.location.value = item.location;
      elements.salary.value = item.salary;
      renderAll();
    });
    elements.savedList.append(row);
  });
  localStorage.setItem("joblens_saved_searches", JSON.stringify(state.savedSearches));
}

function saveCurrentSearch() {
  const salaryOption = elements.salary.selectedOptions[0];
  state.savedSearches.unshift({
    query: elements.query.value.trim(),
    location: elements.location.value.trim(),
    salary: elements.salary.value,
    salaryLabel: salaryOption.textContent,
    createdAt: Date.now()
  });
  state.savedSearches = state.savedSearches.slice(0, 6);
  renderSavedSearches();
}

async function loadLatestJobs() {
  try {
    const response = await fetch("/api/jobs?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    bossMeta = payload.meta || { status: "empty" };
    state.syncRunning = Boolean(payload.runtime && payload.runtime.syncRunning);
    const source = jobSources.find((item) => item.id === "boss");
    if (source) source.status = bossMeta.status === "ok" ? "实时" : bossMeta.status === "stale" ? "上次数据" : "需处理";
    elements.syncText.textContent = state.syncRunning
      ? "正在从 BOSS 直聘同步最新职位"
      : "每 30 秒检查更新，后台每 " + (payload.runtime && payload.runtime.syncMinutes || 30) + " 分钟同步";
    renderAll();
  } catch (error) {
    bossMeta = Object.assign({}, bossMeta, { status: "error" });
    elements.syncText.textContent = "无法连接动态服务，请通过 server.js 打开网站";
    renderAll();
  }
}

async function refreshNow() {
  if (state.syncRunning) return;
  state.syncRunning = true;
  elements.syncText.textContent = "正在请求 BOSS 直聘同步";
  try {
    await fetch("/api/sync", { method: "POST" });
  } finally {
    setTimeout(loadLatestJobs, 1500);
  }
}

function updateAutoRefresh() {
  clearInterval(state.timerId);
  if (!elements.autoRefresh.checked) {
    elements.syncText.textContent = "自动刷新已暂停";
    return;
  }
  elements.syncText.textContent = "每 30 秒刷新一次招聘信息";
  state.timerId = setInterval(loadLatestJobs, 30000);
}

function renderAll() {
  renderSources();
  renderJobs();
  renderSkillChips();
}

function bindEvents() {
  document.querySelector("#searchBtn").addEventListener("click", renderAll);
  document.querySelector("#refreshBtn").addEventListener("click", refreshNow);
  document.querySelector("#saveSearchBtn").addEventListener("click", saveCurrentSearch);
  document.querySelector("#applyProfileBtn").addEventListener("click", () => {
    parseResumeSkills();
    renderJobs();
    renderSkillChips();
  });
  document.querySelector("#allSourcesBtn").addEventListener("click", () => {
    state.selectedSources = new Set(jobSources.map((source) => source.id));
    renderAll();
  });
  document.querySelector("#clearSavedBtn").addEventListener("click", () => {
    state.savedSearches = [];
    localStorage.removeItem("joblens_saved_searches");
    renderSavedSearches();
  });

  [elements.query, elements.location, elements.salary, elements.sortBy].forEach((input) => {
    input.addEventListener("input", renderAll);
    input.addEventListener("change", renderAll);
  });

  elements.sourceList.addEventListener("change", (event) => {
    const sourceId = event.target.dataset.source;
    if (!sourceId) return;
    if (event.target.checked) state.selectedSources.add(sourceId);
    else state.selectedSources.delete(sourceId);
    renderAll();
  });

  elements.savedList.addEventListener("click", (event) => {
    const index = event.target.dataset.remove;
    if (index === undefined) return;
    state.savedSearches.splice(Number(index), 1);
    renderSavedSearches();
  });

  elements.autoRefresh.addEventListener("change", updateAutoRefresh);

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const panel = document.querySelector(`[data-panel="${button.dataset.view}"]`);
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

parseResumeSkills();
renderAll();
renderSavedSearches();
bindEvents();
updateAutoRefresh();
loadLatestJobs();
