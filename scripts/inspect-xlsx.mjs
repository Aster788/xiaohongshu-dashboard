/**
 * One-off: print sheet names + first 4 rows (trimmed) per sheet. Run: node scripts/inspect-xlsx.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "caser-xiaohongshu-data");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".xlsx"));

for (const name of files) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(dir, name));
  console.log("\n=== FILE:", name, "===");
  wb.eachSheet((ws) => {
    console.log("  SHEET:", ws.name);
    let r = 0;
    ws.eachRow({ includeEmpty: true }, (row) => {
      r += 1;
      if (r > 4) return;
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = String(cell.value ?? "").slice(0, 80);
      });
      const line = cells.map((c) => (c ?? "").trim()).join(" | ");
      console.log(`    R${r}:`, line);
    });
  });
}
