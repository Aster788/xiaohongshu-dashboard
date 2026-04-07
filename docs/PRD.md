# Caser 小红书数据看板 — 需求与技术方案（轻量）

## 项目目标（一句话）

为研究中心运营向老师汇报：用**服务端持久化**的 Web 看板展示小红书账号宏观指标、趋势与 Top 笔记，数据来自**官方导出的 Excel 多 Sheet**合并与**运营手填**，**不做爬虫与自动登录**。

## 技术栈及理由

| 选型 | 理由 |
|------|------|
| **Next.js（App Router）** | 同构 React、路由与 API Route 一体，便于部署到 Vercel，展示页与上传 API 同仓库。 |
| **PostgreSQL + Prisma**（或 Drizzle，二选一） | 关系型数据适合笔记/按日指标/设置；迁移与类型安全清晰。托管可选 **Supabase** 或 **Vercel Postgres**。 |
| **`xlsx`（SheetJS）或 exceljs** | 服务端解析 `.xlsx` 多 Sheet；须在 **Node runtime** 跑上传解析（避免 Edge 对 Buffer 的限制）。 |
| **Recharts**（或同类） | 粉丝趋势、互动/点击率等折线或柱状图，与 React 集成简单。 |

## 核心页面与功能（≤5）

1. **`/` 展示页（公开）**：英文 UI；顶部 **caser-logo-01.png** + *Xiaohongshu Analytics Dashboard*；宏观 KPI（**手填为准**：Followers、Total posts、Likes & Saves、Days since launch，成立日固定 2025-06-15）；粉丝曲线（2025-06-15 起算 0 粉至近 30 日窗口首日对齐 + 窗口内真实数据）、爆发日悬浮提示（阈值初值 15）；细分图表与 **Top 10 by views**（年份筛选：**All** + 数据中出现的年份动态列表）；笔记标题等**导出字段原样**；**View post** 仅当 `postUrl` 存在时显示。
2. **`/upload` 上传与运营页（保密）**：`UPLOAD_SECRET` 鉴权；**不出现在展示页导航**。支持一次**多个文件** + **单文件多 Sheet**；拖入官方导出 xlsx；解析后以**中文 Sheet 名与列名**识别类型；合并后返回**预览**（新增/更新/未触碰条数）；表单**手填宏观 KPI**（覆盖库内设置）。
3. **同页「Post links」区块**：按标题关键词与日期筛选笔记，**手动粘贴 URL 保存**（覆盖该笔记旧链）；可选 Clear；无批量映射表（首版）。
4. **（隐含）鉴权与配置**：环境变量 `DATABASE_URL`、`UPLOAD_SECRET`；展示页无登录（公开）。

## 数据结构设计（逻辑模型）

- **`Note`**（笔记明细，合并键 **`title` + `publishedDate`（精确到日）**）：来源「笔记列表明细表」；字段含体裁、曝光、观看、点赞、评论、收藏、分享、涨粉（若有）等；`postUrl` 可空；**同键新数据覆盖旧数据**。
- **`AccountDaily`**（账号按日，合并键 **`date`**）：净涨粉趋势、封面点击率趋势、点赞/评论/收藏/分享趋势等序列；**账号总体\*** 类快照可归一为 `metricKey` + `date` + `value` 或 JSONB，实施时选简单查询形态。
- **`Settings`**（键值或单行 JSON）：`followers`、`totalPosts`、`likesAndSaves`（点赞+收藏之和）、`launchDate`（默认 2025-06-15）等；**展示页顶部以手填为准**，不与 Excel 汇总争优先级。
- 合并原则：上传中**未出现的旧键保留**；出现的键**新覆盖旧**。

## 模块拆分

| 模块 | 职责 |
|------|------|
| `app/(public)/page.tsx` 等 | 展示页布局与数据获取（Server Component + 必要时小 Client 图表）。 |
| `app/upload/` | 上传页 UI（Client 多文件、密钥头、手填 KPI、Post links）。 |
| `app/api/*` | HTTP 鉴权、multipart、调用 service。 |
| `lib/excel/` | 读 xlsx、按 Sheet/表头路由到解析器；**跳过笔记明细第 1 行说明、第 2 行表头**；**中文日期**解析（如 `2026年03月16日08时00分29秒`）。 |
| `lib/merge/` | 笔记/日维度的 upsert 与预览统计（新增/更新/保留）。 |
| `lib/db/` | Prisma client、查询封装。 |
| `components/` | 图表、KPI 卡片、Top 10 列表等可复用 UI。 |

## API 接口定义（首版）

鉴权：上传相关接口校验 `Authorization: Bearer <UPLOAD_SECRET>`（或与 PRD 一致的表单字段，二选一在实现时统一）。

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/upload` | `multipart/form-data`：`files[]` 多个 xlsx。可选同请求携带手填 KPI 字段。响应：`{ inserted, updated, untouched, errors? }` 及必要时的摘要信息。 |
| `GET` | `/api/settings` | 返回当前 `Settings`（供上传页预填、可选供展示页）。**可公开或仅上传密钥可读**——若展示页用 Server 直读 DB 则可不暴露此 GET。 |
| `PUT` | `/api/settings` | 需密钥。更新手填宏观 KPI 与 launchDate（若允许修改）。 |
| `GET` | `/api/notes` | 需密钥。Query：`q`（标题 substring）、`year`、`from`/`to`（日期）；分页。供上传页 Post links 列表。 |
| `PATCH` | `/api/notes/:id` | 需密钥。Body：`{ postUrl: string \| null }`。更新或清空链接。 |

展示页数据优先 **Server Component 直接查库**，避免多余公开 API surface；仅当需要客户端刷新时再增加只读 JSON API。

## Excel 与 Sheet 范围（摘要）

- **笔记列表明细**：保留业务列；忽略导出说明行。
- **近 30 日观看**：仅「封面点击率趋势」。
- **近 30 日发布**：仅「账号总体发布数据」。
- **近 30 日涨粉**：「净涨粉趋势」「账号总体涨粉数据」。
- **近 30 日互动**：账号总体互动 + 点赞/评论/收藏/分享趋势（五类相关 Sheet）。

解析以**文件内中文名**为准，文件名可任意。

## 品牌与资源

### 品牌与视觉 / UI 原则

- **主色**：界面与品牌识别**必须以中心紫色系为主**，具体 HEX 与角色命名见 [`references/color-purple.md`](references/color-purple.md)（主紫、文字紫、Logo 深紫、背景深紫等）。**为什么**：与研究中心既有视觉一致，强化品牌识别。
- **辅色与中性色**：背景、边框、分割线、禁用态、次要文字等，须在**色相与饱和度上与紫系协调**（例如偏冷的灰紫、浅紫高光、深紫压暗），避免与主色无关的「跳色」。
- **图表色**：折线/柱状/图例等数据可视化用色，同样遵循**同冷暖倾向、与紫系和谐**的调色（可在主紫基础上做明度/饱和度变化，或低饱和对比色），**避免**高饱和、与紫色冲突的互补色大块铺色。

### 资源路径

- 紫色 tokens：见 `references/color-purple.md`（数值以该文件为准）。
- Logo：**必须使用** `assests/caser-logo-01.png`（路径拼写与仓库一致）；`caser-logo-02.jpg` 可选。
- 样例 xlsx：`caser-xiaohongshu-data/`（与 `assests/` 同级）；勿将敏感数据提交公开仓库。

## 明确不做

- 爬虫、自动登录小红书、根据主页按标题自动抓链接。
- 纯前端作为唯一数据源（必须服务端 DB）。
- 上传页出现在展示页导航。
- 首版批量「标题+链接」补充表上传（可后续增强）。
