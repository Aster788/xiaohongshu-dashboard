# 阶段 7 视觉与多端验收清单

适用范围：`/` 展示页（`app/(public)/page.tsx` + `app/globals.css` + `components/dashboard/*`）。

## 1) 品牌紫色与色板对齐（必过）

- [ ] 根 token 与 `references/color-purple.md` 角色一致：
  - `--caser-accent` 对应主紫 `#5C1891`
  - `--caser-text` 对应主文字紫 `#5A1896`
  - `--caser-accent-strong` / Hero 深色与 Logo 深紫 `#4B0F7A` 同色相
  - `--caser-hero-start` 与背景深紫 `#1E0535` 对齐
- [ ] 全站无明显“跳色”高饱和按钮/标签（非成功/失败语义色除外）
- [ ] 图表主线、次线、网格、Tooltip 配色与紫系协调（冷暖倾向一致）
- [ ] 交互态（hover/active/focus）仍保持紫系，不出现蓝色体系回退

## 2) Logo 资源与运行路径（必过）

- [ ] Logo 文件存在：`public/caser-logo-01.png`
- [ ] 首页渲染引用路径：`/caser-logo-01.png`
- [ ] 图片加载无 404、无尺寸抖动（首屏可见）
- [ ] 文档说明中明确“运行时来源于 `public/`”

## 3) 桌面端可读性（Chrome / Edge，1440 与 1920）

- [ ] Hero（Logo + 标题）无裁切、无重叠
- [ ] KPI 与 Performance Overview 卡片行高一致、无错位
- [ ] Growth Timeline 图表标签可读，无坐标轴拥挤
- [ ] Content Performance Tabs 可完整点击，切换无跳动
- [ ] Top 10 列表标题、指标、链接三段信息层级清晰
- [ ] 年份筛选 + 排序下拉在同屏可操作，无遮挡

## 4) 手机端可读性（iOS Safari / Android Chrome）

- [ ] 页面无横向滚动（左右滑动不出现空白区）
- [ ] Hero 标题、Logo、链接在 390px 宽度下不重叠
- [ ] 四类图表（折线/柱状）容器内不溢出，Tooltip 不截断关键值
- [ ] Top 10 卡片在窄屏可读：标题换行自然，指标不挤成一行
- [ ] 筛选区（年份 + 排序）可单手操作，展开菜单不被裁切
- [ ] 320~420px 超窄屏下仍可浏览核心信息（无“必须横屏”场景）

## 5) 回归检查（避免“改样式伤功能”）

- [ ] 年份筛选参数在 URL 中保持正确（`year` / `sort`）
- [ ] `View post` 仅在有 `postUrl` 时出现
- [ ] 首页无 `/upload` 导航入口
- [ ] 数据展示值与后端聚合口径无变更（仅样式变更）

## 6) 通过判定

同时满足以下条件即判定「阶段 7 的视觉子项通过」：

1. 品牌紫色与 Logo 条目全部勾选；
2. 桌面与手机条目全部勾选；
3. 回归检查无功能退化。
