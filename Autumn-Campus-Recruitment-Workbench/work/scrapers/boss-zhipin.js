#!/usr/bin/env node
/*
 * BOSS Zhipin scraper for JobLens.
 *
 * This script uses a normal browser session and stops cleanly if BOSS Zhipin
 * asks for login, captcha, or other manual verification. It does not bypass
 * access controls. Use it only where you have permission and comply with the
 * site's terms and robots policy.
 */

const fs = require("node:fs");
const path = require("node:path");

const PLAYWRIGHT_PATH = "/Users/liuxinya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(PLAYWRIGHT_PATH);

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const WORK_DIR = path.join(PROJECT_ROOT, "work");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "outputs", "data");
const ARTIFACT_DIR = path.join(WORK_DIR, "artifacts", "boss-zhipin");
const USER_DATA_DIR = path.join(WORK_DIR, ".browser", "boss-zhipin");
const DEFAULT_CITY = "101020100"; // Shanghai

const args = parseArgs(process.argv.slice(2));
const query = args.query || "前端 React";
const city = args.city || DEFAULT_CITY;
const limit = Number(args.limit || 30);
const headless = !args.headful;
const browserPath = args.browser || findLocalBrowser();
const mode = args.mode || "api";
const cookieHeader = loadCookieHeader(args.cookie, args["cookie-file"] || process.env.BOSS_COOKIE_FILE);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [rawKey, rawValue] = item.slice(2).split("=");
    const nextValue = argv[index + 1];
    if (rawValue !== undefined) parsed[rawKey] = rawValue;
    else if (nextValue && !nextValue.startsWith("--")) {
      parsed[rawKey] = nextValue;
      index += 1;
    } else parsed[rawKey] = true;
  }
  return parsed;
}

function findLocalBrowser() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function loadCookieHeader(inlineCookie, cookieFile) {
  if (inlineCookie) return String(inlineCookie).trim();
  if (process.env.BOSS_COOKIE) return process.env.BOSS_COOKIE.trim();
  if (!cookieFile) return "";
  return fs.readFileSync(cookieFile, "utf8").trim();
}

function cookieHeaderToPlaywrightCookies(header) {
  if (!header) return [];
  return header.split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return null;
      return {
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
        domain: ".zhipin.com",
        path: "/"
      };
    })
    .filter(Boolean);
}

function withCookie(headers) {
  return cookieHeader ? { ...headers, cookie: cookieHeader } : headers;
}

function ensureDirs() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

function buildSearchUrl() {
  const params = new URLSearchParams({ query, city });
  return `https://www.zhipin.com/web/geek/job?${params.toString()}`;
}

function parseSalary(value) {
  const text = String(value || "").replace(/薪/g, "");
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*k/gi)].map((match) => Number(match[1]));
  if (matches.length >= 2) return { minSalary: matches[0], maxSalary: matches[1] };
  if (matches.length === 1) return { minSalary: matches[0], maxSalary: matches[0] };
  return { minSalary: 0, maxSalary: 0 };
}

function normalizeJob(raw, index) {
  const salary = parseSalary(raw.salary);
  const title = raw.title || "未命名职位";
  const company = raw.company || "未知公司";
  const location = raw.location || raw.area || "未知地点";
  const skills = [...new Set((raw.tags || []).filter(Boolean))].slice(0, 8);
  const idSource = `${title}|${company}|${location}|${raw.salary || ""}`;

  return {
    id: `boss-${Buffer.from(idSource).toString("base64url").slice(0, 12)}-${index}`,
    title,
    company,
    source: "boss",
    location,
    remote: raw.remote || "以职位页为准",
    minSalary: salary.minSalary,
    maxSalary: salary.maxSalary,
    postedHours: raw.postedHours || 1,
    skills,
    summary: raw.summary || [raw.experience, raw.education, raw.finance, raw.companySize].filter(Boolean).join(" · ") || "来自 BOSS 直聘的实时职位结果。",
    url: raw.url || "https://www.zhipin.com/",
    fetchedAt: new Date().toISOString()
  };
}

function normalizeApiJob(raw, index) {
  const salary = parseSalary(raw.salaryDesc || raw.salary || raw.salaryMonthDesc);
  const cityParts = [raw.cityName, raw.areaDistrict, raw.businessDistrict].filter(Boolean);
  const skills = [...new Set([...(raw.skills || []), ...(raw.welfareList || [])].filter(Boolean))].slice(0, 8);
  const jobId = raw.encryptJobId || raw.jobId || index;
  const url = raw.encryptJobId
    ? `https://www.zhipin.com/job_detail/${raw.encryptJobId}.html?lid=${raw.lid || ""}&securityId=${raw.securityId || ""}`
    : "https://www.zhipin.com/";
  return {
    id: `boss-${jobId}`,
    title: raw.jobName || raw.title || "未命名职位",
    company: raw.brandName || raw.companyName || "未知公司",
    source: "boss",
    location: cityParts.join(" · ") || raw.location || "未知地点",
    remote: raw.jobLabels?.join(" · ") || "以职位页为准",
    minSalary: salary.minSalary,
    maxSalary: salary.maxSalary,
    postedHours: 1,
    skills,
    summary: [raw.jobExperience, raw.jobDegree, raw.brandIndustry, raw.brandScaleName].filter(Boolean).join(" · ") || "来自 BOSS 直聘搜索接口的职位结果。",
    url,
    fetchedAt: new Date().toISOString()
  };
}

async function detectManualGate(page) {
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const gated = /验证码|安全验证|登录|扫码|异常访问|访问受限|请先验证/.test(bodyText);
  return gated ? bodyText.slice(0, 500) : "";
}

async function extractJobs(page) {
  return page.evaluate(() => {
    const cardSelectors = [".job-card-wrapper", ".job-card-body", ".job-list-box li", ".job-primary"];
    const cards = cardSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const uniqueCards = [...new Set(cards)];

    function text(root, selectors) {
      for (const selector of selectors) {
        const found = root.querySelector(selector);
        if (found && found.textContent.trim()) return found.textContent.trim();
      }
      return "";
    }

    function tags(root) {
      const selectors = [".tag-list li", ".job-card-footer li", ".job-tags span", ".info-desc"];
      return selectors.flatMap((selector) =>
        Array.from(root.querySelectorAll(selector))
          .map((node) => node.textContent.trim())
          .filter(Boolean)
      );
    }

    return uniqueCards.map((card) => {
      const link = card.querySelector("a[href*='/job_detail/'], a[href*='/job/']");
      const href = link ? link.getAttribute("href") : "";
      const url = href ? new URL(href, location.origin).toString() : location.href;
      return {
        title: text(card, [".job-name", ".job-title", ".name", "h3"]),
        company: text(card, [".company-name", ".boss-name", ".company-text .name", ".info-company h3"]),
        salary: text(card, [".salary", ".red", ".job-limit .salary"]),
        location: text(card, [".job-area", ".job-location", ".area"]),
        experience: text(card, [".job-limit p", ".info-primary p"]),
        education: text(card, [".job-limit p:nth-of-type(2)"]),
        companySize: text(card, [".company-tag-list", ".company-info"]),
        tags: tags(card),
        summary: text(card, [".job-card-footer", ".info-desc", ".job-detail"]),
        url
      };
    }).filter((job) => job.title || job.company);
  });
}

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonLd(html) {
  const blocks = [...String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.flatMap((match) => {
    try {
      const parsed = JSON.parse(match[1].trim());
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  });
}

function extractJobsFromHtml(html) {
  const jsonLdJobs = extractJsonLd(html)
    .filter((item) => /JobPosting/i.test(String(item["@type"] || "")))
    .map((item) => ({
      title: item.title,
      company: item.hiringOrganization?.name,
      salary: item.baseSalary?.value?.value || item.baseSalary?.value?.minValue ? `${item.baseSalary.value.minValue || item.baseSalary.value.value}k-${item.baseSalary.value.maxValue || item.baseSalary.value.value}k` : "",
      location: item.jobLocation?.address?.addressLocality,
      tags: Array.isArray(item.skills) ? item.skills : String(item.skills || "").split(/[,，、]/),
      summary: stripTags(item.description),
      url: item.url
    }));
  if (jsonLdJobs.length > 0) return jsonLdJobs;

  const text = stripTags(html);
  const gated = /验证码|安全验证|登录|扫码|异常访问|访问受限|请先验证/.test(text);
  if (gated) return { gated: true, message: text.slice(0, 500) };
  return [];
}

async function scrapeWithHttp(url) {
  const response = await fetch(url, {
    headers: withCookie({
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    })
  });
  const html = await response.text();
  const htmlPath = path.join(ARTIFACT_DIR, "http-response.html");
  fs.writeFileSync(htmlPath, html);
  const extracted = extractJobsFromHtml(html);
  if (extracted.gated) return { status: "manual_verification_required", message: extracted.message, htmlPath, jobs: [] };
  return { status: response.ok ? "ok" : "http_error", statusCode: response.status, htmlPath, jobs: extracted };
}

async function scrapeWithApi(url) {
  const apiUrl = new URL("https://www.zhipin.com/wapi/zpgeek/search/joblist.json");
  apiUrl.searchParams.set("scene", "1");
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("city", city);
  apiUrl.searchParams.set("page", "1");
  apiUrl.searchParams.set("pageSize", String(limit));
  const response = await fetch(apiUrl, {
    headers: withCookie({
      "accept": "application/json,text/plain,*/*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "referer": url,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    })
  });
  const body = await response.text();
  const apiPath = path.join(ARTIFACT_DIR, "api-response.json");
  fs.writeFileSync(apiPath, body);
  let parsed = {};
  try { parsed = JSON.parse(body); } catch { parsed = {}; }
  const list = parsed.zpData?.jobList || parsed.zpData?.jobs || parsed.data?.jobList || [];
  if (Array.isArray(list) && list.length > 0) return { status: "ok", statusCode: response.status, apiPath, jobs: list.map(normalizeApiJob) };
  const message = parsed.message || body.slice(0, 500);
  const restricted = /异常|验证|登录|访问受限|安全/.test(message) || [37, 403, 401].includes(parsed.code);
  return { status: restricted ? "access_restricted" : "empty", statusCode: response.status, apiPath, message, jobs: [] };
}

function writeOutputs(jobs, meta) {
  const payload = { meta, jobs };
  const jsonPath = path.join(OUTPUT_DIR, "boss-jobs.json");
  const jsPath = path.join(OUTPUT_DIR, "boss-jobs.js");
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(jsPath, `window.BOSS_JOBS = ${JSON.stringify(jobs, null, 2)};\nwindow.BOSS_JOBS_META = ${JSON.stringify(meta, null, 2)};\n`);
  return { jsonPath, jsPath };
}

async function main() {
  ensureDirs();
  const url = buildSearchUrl();
  if (mode === "api") {
    const result = await scrapeWithApi(url);
    const outputs = writeOutputs(result.jobs, {
      source: "boss",
      status: result.status,
      query,
      city,
      url,
      count: result.jobs.length,
      statusCode: result.statusCode,
      message: result.message,
      usedCookie: Boolean(cookieHeader),
      fetchedAt: new Date().toISOString(),
      artifacts: { apiPath: result.apiPath }
    });
    console.log(JSON.stringify({ status: result.status, count: result.jobs.length, ...outputs }, null, 2));
    return;
  }
  if (mode === "http") {
    const result = await scrapeWithHttp(url);
    const normalized = result.jobs.slice(0, limit).map(normalizeJob);
    const outputs = writeOutputs(normalized, {
      source: "boss",
      status: normalized.length > 0 ? "ok" : (result.status === "ok" ? "empty" : result.status),
      query,
      city,
      url,
      count: normalized.length,
      statusCode: result.statusCode,
      message: result.message,
      usedCookie: Boolean(cookieHeader),
      fetchedAt: new Date().toISOString(),
      artifacts: { htmlPath: result.htmlPath }
    });
    console.log(JSON.stringify({ status: normalized.length > 0 ? "ok" : result.status, count: normalized.length, ...outputs }, null, 2));
    return;
  }
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    executablePath: browserPath,
    viewport: { width: 1360, height: 920 },
    locale: "zh-CN",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  });

  const page = context.pages()[0] || await context.newPage();
  try {
    const cookies = cookieHeaderToPlaywrightCookies(cookieHeader);
    if (cookies.length > 0) await context.addCookies(cookies);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    const gateText = await detectManualGate(page);
    if (gateText) {
      const htmlPath = path.join(ARTIFACT_DIR, "manual-gate.html");
      const screenshotPath = path.join(ARTIFACT_DIR, "manual-gate.png");
      fs.writeFileSync(htmlPath, await page.content());
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);
      writeOutputs([], {
        source: "boss",
        status: "manual_verification_required",
        query,
        city,
        url,
        message: gateText,
        usedCookie: Boolean(cookieHeader),
        fetchedAt: new Date().toISOString(),
        artifacts: { htmlPath, screenshotPath }
      });
      console.log(JSON.stringify({ status: "manual_verification_required", htmlPath, screenshotPath }, null, 2));
      return;
    }

    await page.waitForSelector(".job-card-wrapper, .job-card-body, .job-list-box li, .job-primary", { timeout: 15000 }).catch(() => null);
    const rawJobs = await extractJobs(page);
    const normalized = rawJobs.slice(0, limit).map(normalizeJob);
    const outputs = writeOutputs(normalized, {
      source: "boss",
      status: normalized.length > 0 ? "ok" : "empty",
      query,
      city,
      url,
      count: normalized.length,
      usedCookie: Boolean(cookieHeader),
      fetchedAt: new Date().toISOString()
    });
    console.log(JSON.stringify({ status: normalized.length > 0 ? "ok" : "empty", count: normalized.length, ...outputs }, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  ensureDirs();
  const browserLaunchFailed = /launchPersistentContext|Crashpad|Target page, context or browser has been closed/.test(error.message);
  writeOutputs([], {
    source: "boss",
    status: browserLaunchFailed ? "browser_launch_failed" : "error",
    query,
    city,
    message: error.message,
    usedCookie: Boolean(cookieHeader),
    fetchedAt: new Date().toISOString()
  });
  console.error(error);
  process.exitCode = 1;
});
