import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatBalanceMarkdown, runBalance } from '../src/balance.js';

const runs = Number(process.argv.find((a) => a.startsWith('--runs='))?.slice(7) ?? 400);
const t0 = Date.now();
const report = runBalance({ runs });
const md = formatBalanceMarkdown(report);
console.log(md);
console.log(`(${Date.now() - t0} ms)`);
if (process.argv.includes('--write')) {
  const out = fileURLToPath(new URL('../../../docs/BALANCE.md', import.meta.url));
  writeFileSync(out, md);
  console.log(`Escrito en ${out}`);
}
