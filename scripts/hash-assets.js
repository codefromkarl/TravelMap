/**
 * 部署时自动为 JS/CSS 文件生成内容哈希文件名
 * 解决浏览器缓存导致的旧代码问题
 *
 * 用法：node scripts/hash-assets.js <deploy-dir>
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { createHash } from 'crypto';

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

// 匹配所有引用 modules/ 和 styles/ 下 .js/.css 的路径（src=, href=, from=, import）
// 支持: src="./modules/x.js", href="./styles/x.css", import './modules/x.js'
const patterns = [
  // src/href 引用 modules/ 或 styles/
  /((?:src|href)=["']\.\/)((?:modules|styles)\/[^"']+\.(?:js|css))(?:\?v=[^"']*)?(["'])/g,
  // import/from 引用 modules/
  /((?:import|from)\s+["']\.\/)(modules\/[^"']+\.(?:js|css))(?:\?v=[^"']*)?(["'])/g,
];

let count = 0;

for (const regex of patterns) {
  // Reset regex lastIndex
  regex.lastIndex = 0;
  let match;
  const matches = [];

  while ((match = regex.exec(html)) !== null) {
    matches.push({
      full: match[0],
      prefix: match[1],
      assetPath: match[2],
      suffix: match[3],
    });
  }

  for (const m of matches) {
    const filePath = join(deployDir, m.assetPath);

    if (!existsSync(filePath)) {
      console.warn(`  ⚠️  Skip (not found): ${m.assetPath}`);
      continue;
    }

    const content = readFileSync(filePath);
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
    const ext = extname(m.assetPath);
    const base = m.assetPath.replace(ext, '');
    const hashedPath = `${base}.${hash}${ext}`;

    const hashedFilePath = join(deployDir, hashedPath);
    copyFileSync(filePath, hashedFilePath);

    // 替换 HTML 中的引用
    const newRef = `${m.prefix}${hashedPath}${m.suffix}`;
    html = html.replaceAll(m.full, newRef);

    count++;
    console.log(`  ✅ ${m.assetPath} → ${hashedPath}`);
  }
}

writeFileSync(indexPath, html, 'utf-8');
console.log(`\n📦 ${count} assets hashed in ${deployDir}`);
