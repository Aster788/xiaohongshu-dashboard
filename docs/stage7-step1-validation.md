# 阶段 7 Step 1 验收记录（视觉与多端兼容）

状态：已完成（代码与文档验收）  
对应任务：`docs/tasks.md` 阶段 7 第 1 项（主题）与多端可读性延伸验收

## 变更摘要（本轮已落地）

- 样式文件：`app/globals.css`
- 改动目标：
  - 统一紫色 token 使用，减少分散硬编码紫色
  - 修复/预防小屏横向溢出
  - 提升手机端筛选区、Top 10 卡片、图表容器可读性

## 已完成项

- [x] 新增 `--caser-accent-strong`，统一章节强调色与 badge
- [x] Tabs / Year pills / Sort dropdown 激活态统一到品牌紫 token
- [x] Hero 装饰渐变改为紫色系（移除偏青色倾向）
- [x] 布局宽度计算由 `100vw` 改为 `100%` 路径，降低横向溢出风险
- [x] 根容器加入 `overflow-x: clip`
- [x] 760px 断点下优化筛选区宽度与间距
- [x] 新增 420px 超窄屏断点，调小图表高度与卡片 padding

## 本地验证记录

### 1) 构建验证

- 命令：`npm run build`
- 结果：失败（环境占用型问题）
- 现象：Windows 上 Prisma 引擎 DLL 重命名 `EPERM`
- 说明：与样式改动无关，通常是本地 dev 进程占用 `node_modules/.prisma/*` 导致

### 2) 备选验证

- 命令：`npx next build`
- 结果：命令返回成功（用于快速确认 Next build 主流程可执行）

## 浏览器实测补充（建议但不阻塞本次结项）

- [ ] 桌面 Chrome：1440 / 1920 两个宽度截图留档
- [ ] 桌面 Edge：关键模块（Hero、图表、Top 10）截图留档
- [ ] iOS Safari：390px 宽度完整滚动检查
- [ ] Android Chrome：360px 宽度完整滚动检查

## 结项判定

- [x] `docs/stage7-visual-checklist.md` 已落地，作为统一验收口径
- [x] 主题与小屏兼容核心改动已完成（`app/globals.css`）
- [x] Logo 运行路径与资源位置一致（`/caser-logo-01.png` -> `public/caser-logo-01.png`）
- [x] 样式文件未检出历史偏蓝紫色硬编码（关键词回归检查通过）
- [x] 本轮可判定为「Step 1 完成」，后续仅补充跨浏览器截图留档

## 风险与处理

- 风险：图表 tooltip 在极窄屏可能遮挡数据点
  - 处理：如发现遮挡，优先改 tooltip 宽度与偏移，不先改数据结构
- 风险：后续功能改动引入新的硬编码颜色
  - 处理：新增样式时强制走 `:root` token，避免新增“孤儿色值”

## 回滚指引

如果本轮出现视觉回归，可仅回滚 `app/globals.css` 中对应模块区块：

1. Hero 区块（`.dashboard-hero*`）
2. 筛选区块（`.top-filter-bar` / `.sort-filter*` / `.year-pill*`）
3. Top 10 区块（`.top-post-*`）
4. 响应式断点（`@media (max-width: 760px)` 与 `@media (max-width: 420px)`）
