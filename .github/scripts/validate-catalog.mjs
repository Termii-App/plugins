// 插件目录校验（CI: .github/workflows/check.yml 每次 PR / push 执行）。
// 规则与主仓库 src/lib/plugins/catalog.ts 的 parseEntry 对齐，另加：
//   - id 全局唯一
//   - 官方条目（official: true）约束：
//       * downloadUrl / sigUrl 必须指向本仓库 packages/official/ 的
//         <id>-<version>.tar.gz 及同名 .sig（官方包必须随仓库发布，不允许
//         外链，保证可审）
//       * 对应包与签名文件必须存在于本仓库（签名真实性由 check.yml 的
//         minisign 步骤验证）
import { readFileSync, existsSync } from "node:fs";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const HTTPS_RE = /^https:\/\/\S+$/i;

function fail(msg) {
  console.error(`[catalog check] ✗ ${msg}`);
  process.exit(1);
}

let cat;
try {
  cat = JSON.parse(readFileSync("catalog.json", "utf8"));
} catch (e) {
  fail(`catalog.json 无法解析: ${e.message}`);
}
if (cat.version !== 1) fail(`不支持的 catalog schema 版本: ${String(cat.version)}`);
if (!Array.isArray(cat.plugins)) fail("plugins 必须是数组");

const seen = new Set();
for (const [i, e] of cat.plugins.entries()) {
  const where = `plugins[${i}] (${e?.id ?? "?"})`;
  if (!e || typeof e !== "object") fail(`${where}: 条目必须是对象`);
  if (typeof e.id !== "string" || !ID_RE.test(e.id)) fail(`${where}: id 缺失或不是 kebab-case`);
  if (seen.has(e.id)) fail(`${where}: id 重复`);
  seen.add(e.id);
  if (typeof e.name !== "string" || !e.name) fail(`${where}: name 缺失`);
  if (typeof e.version !== "string" || !SEMVER_RE.test(e.version)) fail(`${where}: version 必须是 semver`);
  if (typeof e.apiVersion !== "number") fail(`${where}: apiVersion 缺失`);
  if (e.description !== undefined && typeof e.description !== "string") fail(`${where}: description 必须是字符串`);
  if (e.author !== undefined && typeof e.author !== "string") fail(`${where}: author 必须是字符串`);
  if (e.minAppVersion !== undefined && (typeof e.minAppVersion !== "string" || !SEMVER_RE.test(e.minAppVersion))) fail(`${where}: minAppVersion 必须是 semver`);
  if (e.capabilities !== undefined && (!Array.isArray(e.capabilities) || e.capabilities.some((c) => typeof c !== "string"))) fail(`${where}: capabilities 必须是字符串数组`);
  if (e.official !== undefined && typeof e.official !== "boolean") fail(`${where}: official 必须是布尔值`);
  if (typeof e.downloadUrl !== "string" || !HTTPS_RE.test(e.downloadUrl)) fail(`${where}: downloadUrl 必须是 https 绝对地址`);
  if (e.sigUrl !== undefined && (typeof e.sigUrl !== "string" || !HTTPS_RE.test(e.sigUrl))) fail(`${where}: sigUrl 必须是 https 绝对地址`);

  if (e.official === true) {
    const fname = `${e.id}-${e.version}.tar.gz`;
    if (!e.downloadUrl.endsWith(`packages/official/${fname}`)) {
      fail(`${where}: 官方条目 downloadUrl 必须指向本仓库 packages/official/${fname}（官方包不允许外链）`);
    }
    if (typeof e.sigUrl !== "string" || !e.sigUrl.endsWith(`packages/official/${fname}.sig`)) {
      fail(`${where}: 官方条目必须带指向同仓库的 sigUrl（packages/official/${fname}.sig）`);
    }
    if (!existsSync(`packages/official/${fname}`)) fail(`${where}: 本仓库缺少包文件 packages/official/${fname}`);
    if (!existsSync(`packages/official/${fname}.sig`)) fail(`${where}: 本仓库缺少签名文件 packages/official/${fname}.sig`);
  }
}

console.log(`[catalog check] ✓ ${cat.plugins.length} 个条目通过校验`);
