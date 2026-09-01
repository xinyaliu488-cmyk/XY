# BOSS 直聘采集器

采集器位置：`work/scrapers/boss-zhipin.js`

它会用 Playwright 打开 BOSS 直聘搜索页，提取职位卡片，并生成：

- `outputs/data/boss-jobs.json`：结构化数据和采集元信息
- `outputs/data/boss-jobs.js`：静态页面可直接读取的数据

## 运行

```bash
/Users/liuxinya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node work/scrapers/boss-zhipin.js --mode api --query "前端 React" --city 101020100 --limit 30
```

常用参数：

- `--query`：搜索关键词，默认 `前端 React`
- `--city`：BOSS 城市编码，默认 `101020100` 上海
- `--limit`：最多保存多少条职位，默认 `30`
- `--headful`：打开可视浏览器，便于手动登录或处理验证
- `--browser`：指定 Chrome / Edge / Chromium 可执行文件路径；默认会尝试使用系统 Chrome
- `--mode api`：请求 BOSS 搜索接口，若平台返回环境异常会写入 `access_restricted` 状态
- `--mode http`：请求搜索页 HTML；BOSS 当前主要是 SPA 壳，通常只能用于诊断
- `--mode browser`：用浏览器渲染页面并解析职位卡片；需要当前环境能启动 Chromium/Chrome
- `--cookie "a=b; c=d"`：带上已登录浏览器里的 BOSS Cookie 请求
- `--cookie-file work/scrapers/boss.cookie`：从文件读取 Cookie；也可用环境变量 `BOSS_COOKIE` 或 `BOSS_COOKIE_FILE`

## 合规说明

脚本不会绕过登录、验证码、安全验证、环境检测或平台访问控制。遇到这些情况时会停止采集，保存响应或页面快照到 `work/artifacts/boss-zhipin`，并把 `outputs/data/boss-jobs.json` 的状态写成 `manual_verification_required` 或 `access_restricted`。
如果本地浏览器无法启动，状态会写成 `browser_launch_failed`。

如果你已经在浏览器中正常登录 BOSS，可以把自己的 Cookie 放进 `work/scrapers/boss.cookie`，再运行：

```bash
/Users/liuxinya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node work/scrapers/boss-zhipin.js --mode api --query "前端 React" --city 101020100 --limit 30 --cookie-file work/scrapers/boss.cookie
```

Cookie 是账号凭证，不要提交到仓库或发给不可信对象。

如果系统 Chrome 因权限问题无法启动，可以把 Playwright Chromium 安装到工作区缓存：

```bash
PLAYWRIGHT_BROWSERS_PATH=/Users/liuxinya/Documents/Codex/2026-08-13/w-y/work/.playwright-browsers /Users/liuxinya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/liuxinya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/cli.js install chromium
```

然后运行浏览器模式时带同一个环境变量。

如果需要长期自动更新，建议优先使用官方 API、授权数据源或平台允许的方式；定时任务可接 Cron、GitHub Actions、Cloud Scheduler 或队列系统。
