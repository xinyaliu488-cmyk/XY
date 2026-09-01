# JobLens 简历职位查询网站

这是一个可直接打开的静态 MVP，用来演示求职者按简历关键词搜索多家招聘平台职位、筛选结果、保存搜索和自动更新状态。

## 已实现

- 多来源职位聚合视图：LinkedIn、BOSS 直聘、拉勾、猎聘、前程无忧
- BOSS 直聘采集器：支持浏览器渲染、搜索接口和 HTML 诊断三种模式
- BOSS 采集输出接入前端：生成 `data/boss-jobs.js` 后页面会优先显示真实采集结果
- 关键词、城市/远程、最低薪资筛选
- 按匹配度、薪资、发布时间排序
- 简历技能画像输入，并计算职位匹配度
- 招聘来源开关与平台状态展示
- 保存搜索，本地浏览器持久化
- 自动刷新开关，每 30 秒模拟同步职位数据
- 响应式布局，支持桌面和移动端

## 动态运行

现在需要通过项目根目录的 `server.js` 启动，页面会每 30 秒读取最新数据，后台默认每 30 分钟触发一次 BOSS 同步：

```bash
/Users/liuxinya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

打开 `http://127.0.0.1:4173`。

可通过环境变量调整：

- `BOSS_SYNC_MINUTES`：后台采集间隔，最少 10 分钟，默认 30 分钟
- `BOSS_QUERY`：职位关键词，默认 `前端 React`
- `BOSS_CITY`：BOSS 城市编码，默认 `101020100` 上海
- `BOSS_LIMIT`：单次最多采集数量，默认 30
- `BOSS_COOKIE_FILE`：已登录 BOSS Cookie 文件路径

页面右上角刷新按钮会请求一次即时同步。如果登录过期、安全验证或网络失败，服务会继续提供最近一次成功的数据，不会把职位列表清空。

## 已登录 Chrome 自动同步

BOSS 会对普通服务端请求进行环境校验，因此项目包含一个 Chrome 同步助手：`outputs/boss-sync-extension`。加载该扩展后，它会使用你已经登录的 BOSS 页面每 30 分钟读取一次公开职位卡，并发送到本地 `/api/import`。安装步骤见该目录下的 `README.md`。

动态更新需要同时满足：

1. `server.js` 持续运行。
2. Chrome 同步助手已加载并启用。
3. BOSS 直聘保持登录状态；遇到安全验证时由用户手动完成。

## 采集 BOSS 直聘

采集脚本在 `work/scrapers/boss-zhipin.js`。示例：

```bash
/Users/liuxinya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node work/scrapers/boss-zhipin.js --mode api --query "前端 React" --city 101020100 --limit 10
```

当前环境实际请求 BOSS 搜索接口时，平台返回 `您的环境存在异常`，因此 `outputs/data/boss-jobs.json` 会记录 `access_restricted`，页面中 BOSS 数据源会显示访问受限。脚本没有绕过平台访问限制。

若你有自己浏览器里的已登录 BOSS Cookie，可用 `--cookie`、`--cookie-file`、`BOSS_COOKIE` 或 `BOSS_COOKIE_FILE` 提供给采集器，让它在授权会话下重试。
浏览器模式需要当前环境能启动 Chrome/Chromium；本次沙箱里的系统 Chrome 因 Crashpad 权限被拒绝，工作区 Chromium 下载又遇到网络超时，因此还没有完成可视浏览器采集。
采集器会把这种本地浏览器启动问题记录为 `browser_launch_failed`，和 BOSS 平台返回的 `access_restricted` 分开。

## 真实上线版建议

静态 MVP 可以升级为线上产品：

1. 前端使用 React / Next.js，保留当前信息架构和交互。
2. 后端提供统一搜索 API，例如 `/api/jobs/search`、`/api/sources/sync`、`/api/saved-searches`。
3. 数据采集优先接入官方开放 API、合作数据源或合规 RSS；对不开放的平台需要遵守 robots、登录协议和频率限制。
4. 定时更新使用队列和调度器，例如 Cron、BullMQ、Cloud Scheduler 或 GitHub Actions。
5. 职位去重用公司名、职位名、城市、薪资区间和来源 URL 做指纹。
6. 简历匹配可以从关键词匹配升级到向量检索，把简历、职位描述和技能标签嵌入后计算相似度。
7. 上线可选 Vercel / Netlify 部署前端，Railway / Render / Fly.io 部署 API 和同步任务。

## 文件

- `index.html`：页面结构
- `styles.css`：视觉样式和响应式布局
- `app.js`：搜索、筛选、匹配、保存搜索、自动刷新逻辑
- `data/boss-jobs.json`：BOSS 采集结果和状态元信息
- `data/boss-jobs.js`：前端静态读取的 BOSS 采集结果
