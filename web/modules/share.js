// ─── 行程分享服务 ───────────────────────────────────────
// 零外部依赖，全部使用原生 API
// 提供：分享图片 / 分享链接 / 二维码
// ─────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════
// 1. LZ-String 压缩/解压（精简实现）
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// 1. 简单压缩/解压（base64 + encodeURIComponent）
// ═══════════════════════════════════════════════════════════

const LZ_STRING = {
  compressToBase64(text) {
    if (!text) return "";
    try {
      return btoa(encodeURIComponent(text));
    } catch (e) {
      // Fallback for Node.js test environment
      return Buffer.from(encodeURIComponent(text), "utf-8").toString("base64");
    }
  },

  decompressFromBase64(b64) {
    if (!b64) return "";
    try {
      return decodeURIComponent(atob(b64));
    } catch (e) {
      // Fallback for Node.js test environment
      return decodeURIComponent(Buffer.from(b64, "base64").toString("utf-8"));
    }
  },
};


// ═══════════════════════════════════════════════════════════
// 2. QR 码生成器（精简版，零依赖）
// ═══════════════════════════════════════════════════════════

/**
 * 最小 QR 码生成器
 * 支持：字节模式，Version 2-6，纠错级别 M (15%)
 * 输出：256×256 PNG data URL
 */

// ─── GF(256) 运算表 ─────────────────────────────────
const QR_GF_EXP = new Array(256);
const QR_GF_LOG = new Array(256);
(function initGF() {
  let v = 1;
  for (let i = 0; i < 256; i++) {
    QR_GF_EXP[i] = v;
    QR_GF_LOG[v] = i;
    v = (v << 1) ^ (v >= 128 ? 0x11d : 0);
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return QR_GF_EXP[(QR_GF_LOG[a] + QR_GF_LOG[b]) % 255];
}

// ─── 纠错码生成多项式 ─────────────────────────────
function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const term = [1, QR_GF_EXP[i]];
    const newPoly = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      newPoly[j] ^= gfMul(poly[j], term[0]);
      newPoly[j + 1] ^= gfMul(poly[j], term[1]);
    }
    poly = newPoly;
  }
  return poly;
}

function rsEncode(data, eccCount) {
  const gen = rsGeneratorPoly(eccCount);
  const total = data.length + eccCount;
  const buffer = new Array(total).fill(0);
  for (let i = 0; i < data.length; i++) buffer[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    if (buffer[i] !== 0) {
      const factor = QR_GF_LOG[buffer[i]];
      for (let j = 0; j < gen.length; j++) {
        buffer[i + j] ^= gfMul(gen[j], QR_GF_EXP[factor]);
      }
    }
  }
  const ecc = buffer.slice(data.length);
  return ecc;
}

// ─── QR 码版本信息 ─────────────────────────────────
// [版本, 总码字数, 数据码字数, 纠错码字数, 纠错块数]
const QR_VERSIONS = {
  2: { modules: 25, total: 44, data: 34, ecc: 10, blocks: 1 },
  3: { modules: 29, total: 70, data: 53, ecc: 17, blocks: 1 },
  4: { modules: 33, total: 100, data: 78, ecc: 22, blocks: 2 },
  5: { modules: 37, total: 134, data: 106, ecc: 28, blocks: 2 },
  6: { modules: 41, total: 172, data: 134, ecc: 38, blocks: 4 },
  7: { modules: 45, total: 196, data: 154, ecc: 42, blocks: 2 },
  8: { modules: 49, total: 242, data: 192, ecc: 50, blocks: 2 },
  9: { modules: 53, total: 292, data: 230, ecc: 62, blocks: 2 },
  10: { modules: 57, total: 346, data: 271, ecc: 75, blocks: 2 },
};

function getMinVersion(dataLen) {
  for (const [ver, info] of Object.entries(QR_VERSIONS)) {
    if (dataLen + 3 <= info.data) return parseInt(ver);
  }
  return 6; // max supported
}

// ─── 对齐图案位置 ──────────────────────────────────
const QR_ALIGN_PATTERNS = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// ─── 格式信息（M 纠错，掩码 0-7） ──────────────────
const QR_FORMAT_MASK = 0x5412;
const QR_FORMAT_M_EC_LEVEL = 0b00 << 13; // M = 00
const QR_FORMAT_BITS = (mask) => {
  const data = QR_FORMAT_M_EC_LEVEL | mask;
  let bc = data;
  for (let i = 0; i < 10; i++) {
    bc = (bc << 1) ^ ((bc >> 14) * 0b10100110111);
  }
  const final = ((data << 10) | bc) ^ QR_FORMAT_MASK;
  return final;
};

// ─── 核心 QR 码生成 ────────────────────────────────
function generateQRMatrix(text) {
  // 1. 编码数据（字节模式）
  const utf8Bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      utf8Bytes.push(code);
    } else if (code < 0x800) {
      utf8Bytes.push(0xc0 | (code >> 6));
      utf8Bytes.push(0x80 | (code & 0x3f));
    } else {
      utf8Bytes.push(0xe0 | (code >> 12));
      utf8Bytes.push(0x80 | ((code >> 6) & 0x3f));
      utf8Bytes.push(0x80 | (code & 0x3f));
    }
  }

  const version = getMinVersion(utf8Bytes.length);
  const info = QR_VERSIONS[version];
  if (!info) return null;

  // 2. 构建数据位流
  const bits = [];
  // 模式指示符：字节模式 = 0100
  bits.push(0, 1, 0, 0);
  // 字符计数（8 位用于 v1-9）
  const countBits = 8;
  for (let i = countBits - 1; i >= 0; i--) {
    bits.push((utf8Bytes.length >> i) & 1);
  }
  // 数据字节
  for (const b of utf8Bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((b >> i) & 1);
    }
  }
  // 终止符
  for (let i = 0; i < 4 && bits.length < info.data * 8; i++) {
    bits.push(0);
  }
  // 填充到字节边界
  while (bits.length % 8 !== 0) bits.push(0);
  // 填充到容量
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (bits.length < info.data * 8) {
    for (let i = 7; i >= 0; i--) bits.push((padBytes[pi % 2] >> i) & 1);
    pi++;
  }

  // 3. 转换为码字并纠错
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j++) val = (val << 1) | (bits[i + j] || 0);
    codewords.push(val);
  }

  const dataCodewords = codewords.slice(0, info.data);
  const ecPerBlock = Math.floor(info.ecc / info.blocks);
  const blockSize = Math.ceil(info.data / info.blocks);
  const smallBlockCount = info.blocks * blockSize - info.data;

  // 对每个块纠错
  let allData = [];
  let allECC = [];
  for (let b = 0; b < info.blocks; b++) {
    const start = b * blockSize - Math.max(0, b - smallBlockCount);
    const end = start + blockSize - (b >= info.blocks - smallBlockCount ? 1 : 0);
    const blockData = dataCodewords.slice(start, end);
    const ecc = rsEncode(blockData, ecPerBlock);
    allData.push(blockData);
    allECC.push(ecc);
  }

  // 交错
  const finalCodewords = [];
  const maxDLen = Math.max(...allData.map(d => d.length));
  for (let i = 0; i < maxDLen; i++) {
    for (let b = 0; b < allData.length; b++) {
      if (i < allData[b].length) finalCodewords.push(allData[b][i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < allECC.length; b++) {
      finalCodewords.push(allECC[b][i]);
    }
  }

  // 4. 构建矩阵
  const size = info.modules;
  const matrix = [];
  for (let y = 0; y < size; y++) {
    matrix[y] = new Array(size).fill(0);
  }

  // 查找图案
  function setFinderPattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const y = row + r, x = col + c;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          const isCenter = r === 3 && c === 3;
          matrix[y][x] = (isOuter || isInner || isCenter) ? 1 : 0;
        } else {
          // 分隔区
          matrix[y][x] = 0;
        }
      }
    }
  }

  // 三个查找图案
  setFinderPattern(0, 0);
  setFinderPattern(0, size - 7);
  setFinderPattern(size - 7, 0);

  // 时序图案
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // 对齐图案
  const alignPos = QR_ALIGN_PATTERNS[version];
  if (alignPos) {
    for (let ri = 0; ri < alignPos.length; ri++) {
      for (let ci = 0; ci < alignPos.length; ci++) {
        const ar = alignPos[ri];
        const ac = alignPos[ci];
        // 跳过查找图案区域和时序交叉点
        if ((ar === 6 && ac === 6) ||
            (ar <= 8 && ac <= 8) ||
            (ar <= 8 && ac >= size - 8) ||
            (ar >= size - 8 && ac <= 8)) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const y = ar + r, x = ac + c;
            if (y < 0 || y >= size || x < 0 || x >= size) continue;
            if (r === 0 && c === 0) { matrix[y][x] = 1; continue; }
            if (Math.abs(r) === 2 || Math.abs(c) === 2) { matrix[y][x] = 1; continue; }
            matrix[y][x] = 0;
          }
        }
      }
    }
  }

  // 5. 放置数据
  let dataIdx = 0;
  let dir = -1; // -1 = 向上, 1 = 向下
  let col = size - 1;

  while (col > 0) {
    if (col === 6) col = 5; // 跳过时序图案列
    for (let row = dir === -1 ? size - 1 : 0; dir === -1 ? row >= 0 : row < size; row += dir) {
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        // 跳过保留区域
        if (c < 0) continue;
        if (matrix[row][c] === 0 && dataIdx < finalCodewords.length * 8) {
          const byteIdx = Math.floor(dataIdx / 8);
          const bitIdx = 7 - (dataIdx % 8);
          matrix[row][c] = (finalCodewords[byteIdx] >> bitIdx) & 1;
          dataIdx++;
        }
      }
    }
    dir = -dir;
    col -= 2;
  }

  // 6. 掩码处理（使用掩码 2）
  const mask = 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 不掩码保留区域
      if (isReservedModule(matrix, size, y, x)) continue;
      const m = mask;
      const apply = (m === 0 && (y + x) % 2 === 0) ||
                    (m === 1 && y % 2 === 0) ||
                    (m === 2 && x % 3 === 0) ||
                    (m === 3 && (y + x) % 3 === 0) ||
                    (m === 4 && (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0) ||
                    (m === 5 && (y * x) % 2 + (y * x) % 3 === 0) ||
                    (m === 6 && ((y * x) % 2 + (y * x) % 3) % 2 === 0) ||
                    (m === 7 && ((y + x) % 2 + (y * x) % 3) % 2 === 0);
      if (apply) matrix[y][x] ^= 1;
    }
  }

  // 7. 格式信息
  const fmtBits = QR_FORMAT_BITS(mask);
  for (let i = 0; i < 15; i++) {
    const bit = (fmtBits >> i) & 1;
    // 水平（左上角附近，从左上角开始）
    if (i < 6) {
      matrix[8][i] = bit;
    } else if (i < 8) {
      matrix[8][i + 1] = bit;
    } else {
      matrix[8][size - 15 + i] = bit;
    }
    // 垂直
    if (i < 6) {
      matrix[i][8] = bit;
    } else if (i < 7) {
      // skip timing
    } else {
      matrix[size - 15 + i][8] = bit;
    }
    // 暗模块
    matrix[size - 8][8] = 1;
  }

  return matrix;
}

function isReservedModule(matrix, size, y, x) {
  // 查找图案区域
  if ((y < 8 && x < 8) || (y < 8 && x >= size - 8) || (y >= size - 8 && x < 8)) return true;
  // 时序图案
  if (y === 6 || x === 6) return true;
  // 格式信息
  if (y === 8 && (x >= 0 && x <= 8)) return true;
  if (y === 8 && (x >= size - 8 && x < size)) return true;
  if (x === 8 && (y >= 0 && y <= 8)) return true;
  if (x === 8 && (y >= size - 8 && y < size)) return true;
  return false;
}

// ─── 生成 QR 码 PNG ─────────────────────────────────
export function generateQRCode(url, size = 256) {
  const matrix = generateQRMatrix(url);
  if (!matrix) return null;

  const cellSize = Math.floor(size / matrix.length);
  const padding = Math.floor((size - cellSize * matrix.length) / 2);
  const imgSize = matrix.length * cellSize + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = imgSize;
  canvas.height = imgSize;
  const ctx = canvas.getContext("2d");

  // 白色背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, imgSize, imgSize);

  // 黑色码点
  ctx.fillStyle = "#000000";
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (matrix[y][x] === 1) {
        ctx.fillRect(
          padding + x * cellSize,
          padding + y * cellSize,
          cellSize,
          cellSize
        );
      }
    }
  }

  return canvas.toDataURL("image/png");
}

// ═══════════════════════════════════════════════════════════
// 3. 分享图片生成（Canvas 绘制）
// ═══════════════════════════════════════════════════════════

/**
 * 生成精美行程卡片
 * @param {Object} tripPlan - TripPlan 对象
 * @param {string} [qrCodeDataUrl] - 可选的二维码 data URL
 * @returns {string} PNG data URL (base64)
 */
export async function generateShareImage(tripPlan, qrCodeDataUrl) {
  if (!tripPlan) return null;

  const WIDTH = 900;
  const HEIGHT = 1200;
  const PADDING = 40;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  // ─── 背景 ─────────────────────────────────────────
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ─── 顶部渐变条 ──────────────────────────────────
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
  gradient.addColorStop(0, "#1a73e8");
  gradient.addColorStop(1, "#4285f4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, 220);

  // ─── 顶部城市名 ──────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cityName = tripPlan.city || "旅行计划";
  const maxCityWidth = WIDTH - PADDING * 4;
  let displayCity = cityName;
  if (ctx.measureText(cityName).width > maxCityWidth) {
    let lo = 0, hi = cityName.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(cityName.slice(0, mid) + "…").width <= maxCityWidth) lo = mid;
      else hi = mid - 1;
    }
    displayCity = cityName.slice(0, lo) + "…";
  }
  ctx.fillText(displayCity, WIDTH / 2, 70);

  // ─── 日期范围 ──────────────────────────────────
  ctx.font = "22px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";

  let dateStr = "";
  if (tripPlan.startDate && tripPlan.endDate) {
    const fmt = (d) => {
      const parts = d.split("-");
      return `${parts[1]}月${parts[2]}日`;
    };
    dateStr = `${fmt(tripPlan.startDate)} — ${fmt(tripPlan.endDate)}`;
  }

  if (tripPlan.days && tripPlan.days.length > 0) {
    const daysLabel = tripPlan.days.length + "日游";
    dateStr = dateStr ? `${dateStr}  ·  ${daysLabel}` : daysLabel;
  }

  ctx.fillText(dateStr, WIDTH / 2, 130);

  // ─── 行程天数标识 ──────────────────────────────
  if (tripPlan.days && tripPlan.days.length > 0) {
    ctx.font = "14px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(`共 ${tripPlan.days.length} 天行程`, WIDTH / 2, 175);
  }

  // ─── 中部：每日行程缩略 ─────────────────────────
  const dayStartY = 260;
  const dayHeight = 260;
  const dayGap = 10;
  const maxDays = Math.min(tripPlan.days ? tripPlan.days.length : 0, 3);

  for (let di = 0; di < maxDays; di++) {
    const day = tripPlan.days[di];
    const y = dayStartY + di * (dayHeight + dayGap);

    // 日期卡片背景
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, PADDING, y, WIDTH - PADDING * 2, dayHeight, 12);
    ctx.fill();

    // 日期标题
    ctx.fillStyle = "#1a73e8";
    ctx.font = "bold 18px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const dayLabel = `Day ${di + 1}`;

    let dateLabel = "";
    if (day.date) {
      const parts = day.date.split("-");
      dateLabel = `${parts[1]}月${parts[2]}日`;
    }

    ctx.fillText(`${dayLabel}  ${dateLabel}`, PADDING + 20, y + 15);

    // 城市名
    if (day.city && day.city !== tripPlan.city) {
      ctx.fillStyle = "#666666";
      ctx.font = "14px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
      ctx.fillText(`📍 ${day.city}`, PADDING + 20, y + 48);
    }

    // 景点列表
    let itemY = y + 80;
    const maxAttractions = 2;
    const attractions = (day.attractions || []).slice(0, maxAttractions);

    if (attractions.length === 0) {
      // 显示交通信息
      ctx.fillStyle = "#888888";
      ctx.font = "15px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
      ctx.fillText(`🚗 ${day.transportation || ""}`, PADDING + 20, itemY);
    }

    for (const attr of attractions) {
      // 景点名
      ctx.fillStyle = "#333333";
      ctx.font = "16px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
      ctx.fillText(`📍 ${attr.nameZh || attr.name}`, PADDING + 20, itemY);

      // 描述（截断）
      const desc = (attr.description || "").substring(0, 60);
      if (desc) {
        ctx.fillStyle = "#888888";
        ctx.font = "13px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
        ctx.fillText(desc, PADDING + 30, itemY + 24);
      }

      itemY += 55;
    }

    // 分隔线
    if (di < maxDays - 1) {
      ctx.fillStyle = "#eeeeee";
      ctx.fillRect(PADDING + 10, y + dayHeight - 1, WIDTH - PADDING * 2 - 20, 1);
    }
  }

  // ─── 更多天数提示 ──────────────────────────────
  if (tripPlan.days && tripPlan.days.length > 3) {
    const moreY = dayStartY + 3 * (dayHeight + dayGap) + 10;
    ctx.fillStyle = "#999999";
    ctx.font = "15px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`... 还有 ${tripPlan.days.length - 3} 天精彩行程`, WIDTH / 2, moreY);
  }

  // ─── 底部品牌区域 ──────────────────────────────
  const footerY = HEIGHT - 130;

  // 分隔线
  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING + 40, footerY - 10);
  ctx.lineTo(WIDTH - PADDING - 40, footerY - 10);
  ctx.stroke();

  // 品牌标识
  ctx.fillStyle = "#1a73e8";
  ctx.font = "bold 20px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("TravelMap", PADDING + 20, footerY + 20);

  ctx.fillStyle = "#999999";
  ctx.font = "13px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
  ctx.fillText("AI 智能旅行规划助手", PADDING + 20, footerY + 48);

  // 二维码占位
  if (qrCodeDataUrl) {
    const qrSize = 90;
    const qrX = WIDTH - PADDING - 20 - qrSize;
    const qrY = footerY - 10;
    const img = new Image();
    img.src = qrCodeDataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
  } else {
    // 二维码占位框
    const qrSize = 80;
    const qrX = WIDTH - PADDING - 20 - qrSize;
    const qrY = footerY - 5;
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = "#cccccc";
    ctx.font = "11px 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("二维码", qrX + qrSize / 2, qrY + qrSize / 2 + 4);
    ctx.setLineDash([]);
  }

  return canvas.toDataURL("image/png");
}

// ─── 辅助：圆角矩形 ──────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ═══════════════════════════════════════════════════════════
// 4. 分享链接生成
// ═══════════════════════════════════════════════════════════

/**
 * 生成只读分享链接
 * @param {Object} tripPlan - TripPlan 对象
 * @returns {string} 分享 URL
 */
export function generateShareLink(tripPlan) {
  if (!tripPlan) return "";

  // 提取可分享的数据（精简，避免过大）
  const shareData = {
    c: tripPlan.city,
    s: tripPlan.startDate,
    e: tripPlan.endDate,
    d: (tripPlan.days || []).map(day => ({
      i: day.dayIndex,
      dt: day.date,
      ci: day.city,
      tr: day.transportation,
      a: (day.attractions || []).map(attr => ({
        n: attr.nameZh || attr.name,
        desc: (attr.description || "").substring(0, 80),
      })),
    })),
  };

  const json = JSON.stringify(shareData);
  const compressed = LZ_STRING.compressToBase64(json);

  const baseUrl = "https://travel.codefromkarl.xyz";
  const shareUrl = `${baseUrl}/#share=${encodeURIComponent(compressed)}`;

  // 确保长度 < 2000
  if (shareUrl.length > 2000) {
    // 进一步精简：只保留必要的字段
    const minimalData = {
      c: tripPlan.city,
      s: tripPlan.startDate,
      e: tripPlan.endDate,
      d: (tripPlan.days || []).map(day => ({
        i: day.dayIndex,
        a: (day.attractions || []).map(attr => attr.nameZh || attr.name),
      })),
    };
    const minimalJson = JSON.stringify(minimalData);
    const minimalCompressed = LZ_STRING.compressToBase64(minimalJson);
    return `${baseUrl}/#share=${encodeURIComponent(minimalCompressed)}`;
  }

  return shareUrl;
}

// ═══════════════════════════════════════════════════════════
// 5. 分享链接加载（在目标设备上解析）
// ═══════════════════════════════════════════════════════════

/**
 * 从 URL hash 中加载分享的行程数据
 * @returns {Object|null} 解析后的行程数据
 */
export function loadSharedTripFromHash() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith("#share=")) return null;

  const compressed = decodeURIComponent(hash.replace("#share=", ""));
  if (!compressed) return null;

  try {
    const json = LZ_STRING.decompressFromBase64(compressed);
    if (!json) return null;
    return JSON.parse(json);
  } catch (e) {
    console.warn("[Share] 解析分享链接失败:", e);
    return null;
  }
}

/**
 * 生成下载
 * @param {string} dataUrl - PNG data URL
 * @param {string} filename - 文件名
 */
export function downloadImage(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "travel-plan.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
