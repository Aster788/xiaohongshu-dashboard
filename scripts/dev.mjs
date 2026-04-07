import { spawn } from "node:child_process";
import { createServer } from "node:net";

const PORT = 3000;

function portFree(p) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.listen(p, () => {
      s.close(() => resolve(true));
    });
  });
}

const ok = await portFree(PORT);
if (!ok) {
  console.error(`
Port ${PORT} is already in use (often a leftover "next dev").
Next.js would pick another port (e.g. 3001), but the browser may still open :${PORT} → 404 or wrong app.

Stop the other server (Ctrl+C) or end the Node process using port ${PORT}, then run npm run dev again.

If you intentionally need a free port: npm run dev:any
`);
  process.exit(1);
}

const child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
