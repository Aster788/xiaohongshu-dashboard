# Excel layout calibration (non-sensitive)

## Fixture verified (local)

Aligned with `caser-xiaohongshu-data/` **2026-03-17** export batch:

| File (basename) | Sheets / shape |
|-------------------|----------------|
| `笔记列表明细表.xlsx` | Single sheet **`Sheet1`** (not named 笔记…); row1 note; row2 headers `笔记标题`, **`首次发布时间`**, `曝光`, … |
| `近30日互动数据.xlsx` | `账号总体互动数据` (指标\|数值) + `点赞/评论/收藏/分享趋势` (日期\|数值) |
| `近30日发布数据.xlsx` | `账号总体发布数据` + `总发布/发布视频/发布图文趋势` |
| `近30日涨粉数据.xlsx` | `账号总体涨粉数据` + `净涨粉/新增关注/取消关注/主页访客/主页转粉率趋势` |
| `近30日观看数据.xlsx` | `账号总体观看数据` + `曝光/观看/封面点击率/时长/完播率` trends |

**Note list** workbooks are detected by **filename** (`笔记列表` in basename) because the tab name may stay `Sheet1`.

**Snapshot** sheets (`指标` \| `数值`) get `AccountDaily.date` = **latest date** parsed from any **trend** sheet in the **same** workbook; if none, **local calendar day** of `File.lastModified` from the upload.

## Why tools sometimes “don’t see” `.xlsx`

IDE/workspace search may return **zero** `.xlsx` matches even when Explorer shows files (indexing, ignore rules, or a different workspace root). Use the OS file tree or `scripts/inspect-xlsx.mjs` to confirm.

## Evolution

Unrecognized sheets → English `warnings` in `/api/upload` JSON. Add aliases in `sheetConfig.ts` when the platform renames tabs.
