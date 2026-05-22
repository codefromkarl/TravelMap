/**
 * 部署时自动为 JS/CSS 文件生成内容哈希文件名
 * 解决浏览器缓存导致的旧代码问题
 *
 * 流程：
 *   1. 扫描 index.html 中引用的 .js/.css 文件
 *   2. 计算文件内容 SHA256 哈希（取前8位）
 *   3. 复制文件为 原名.哈希.js/css
 *   4. 替换 index.html 中的引用路径
 *
 * 用法：node scripts/hash-assets.js <deploy-dir>
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { createHash } from 'crypto';
import { globSync } from 'glob';

const deployDir = process.argv[2];
if (!deployDir) {
  console.error('Usage: node scripts/hash-assets.js <deploy-dir>');
  process.exit(1);
}

const indexPath = join(deployDir, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`index.html not found in ${deployDir}`);
  process.exit(1);
}

let html = readFileSync(indexPath, 'utf-8');

// 匹配 src="...js" 和 href="...css"（带或不带查询参数）
const assetRegex = /(src|href)=["'](\/modules\/[^"']+\.(?:js|css))(?:\?v=[^"']*)?["']/g;

const replacements = [];
let match;

while ((match = assetRegex.exec(html)) !== null) {
  const [fullMatch, attr, assetPath] = match;
  const filePath = join(deployDir, assetPath);

  if (!existsSync(filePath)) {
    console.warn(`  ⚠️  Skip (not found): ${assetPath}`);
    continue;
  }

  // 计算内容哈希
  const content = readFileSync(filePath);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);

  // 生成哈希文件名
  const ext = extname(assetPath);
  const base = assetPath.replace(ext, '');
  const hashedPath = `${base}.${hash}${ext}`;

  // 复制为哈希文件名
  const hashedFilePath = join(deployDir, hashedPath);
  copyFileSync(filePath, hashedFilePath);

  // 替换 HTML 中的引用（去掉 ?v= 参数）
  const newRef = `${attr}="${hashedPath}"`;
  html = html.replace(fullMatch, newRef);

  replacements.push({ from: assetPath, to: hashedPath });
  console.log(`  ✅ ${assetPath} → ${hashedPath}`);
}

// 写回 index.html
writeFileSync(indexPath, html, 'utf-8');

console.log(`\n📦 ${replacements.length} assets hashed in ${deployDir}`);
