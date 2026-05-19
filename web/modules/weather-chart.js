/**
 * 天气可视化组件 — 温度曲线图 + 天气图标
 *
 * 纯 SVG 渲染，零外部依赖
 * 输入 WeatherInfo[] 数据，输出 SVG 字符串或直接挂载到 DOM
 */

const WEATHER_ICONS = {
  '晴': '☀️', '多云': '⛅', '阴': '☁️', '少云': '🌤️',
  '小雨': '🌦️', '中雨': '🌧️', '大雨': '⛈️', '暴雨': '🌧️',
  '小雪': '🌨️', '中雪': '❄️', '大雪': '❄️',
  '雾': '🌫️', '霾': '😷',
};

/**
 * 渲染天气图表为 SVG 字符串
 * @param {Array} weatherInfo - WeatherInfo 数组
 * @returns {string} SVG 字符串
 */
export function renderWeatherChart(weatherInfo) {
  if (!weatherInfo || weatherInfo.length === 0) return '';

  const width = Math.max(280, weatherInfo.length * 80);
  const height = 120;
  const padX = 40, padY = 30;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const temps = weatherInfo.flatMap(w => [w.dayTemp, w.nightTemp]).filter(t => t !== undefined && t !== 0);
  if (temps.length === 0) return '';

  const minT = Math.min(...temps) - 2;
  const maxT = Math.max(...temps) + 2;
  const rangeT = Math.max(maxT - minT, 1);

  const xStep = chartW / Math.max(weatherInfo.length - 1, 1);

  // 温度 → Y 坐标
  const toY = (t) => padY + chartH - ((t - minT) / rangeT) * chartH;
  const toX = (i) => padX + i * xStep;

  // 白天温度折线
  const dayPoints = weatherInfo
    .map((w, i) => ({ x: toX(i), y: toY(w.dayTemp), temp: w.dayTemp, weather: w.dayWeather, date: w.date }))
    .filter(p => p.temp !== undefined && p.temp !== 0);

  // 夜间温度折线
  const nightPoints = weatherInfo
    .map((w, i) => ({ x: toX(i), y: toY(w.nightTemp), temp: w.nightTemp }))
    .filter(p => p.temp !== undefined && p.temp !== 0);

  // 构建 SVG 元素
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;max-height:${height}px;font-family:system-ui,-apple-system,sans-serif">`;

  // 背景
  svg += `<rect width="${width}" height="${height}" rx="8" fill="rgba(15,15,17,0.6)"/>`;

  // 网格线
  for (let t = Math.ceil(minT); t <= Math.floor(maxT); t += Math.max(1, Math.floor(rangeT / 4))) {
    const y = toY(t);
    svg += `<line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>`;
    svg += `<text x="${padX - 4}" y="${y + 3}" text-anchor="end" fill="rgba(255,255,255,0.4)" font-size="9">${t}°</text>`;
  }

  // 白天折线
  if (dayPoints.length > 1) {
    const pathD = dayPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    svg += `<path d="${pathD}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  // 夜间折线
  if (nightPoints.length > 1) {
    const pathD = nightPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    svg += `<path d="${pathD}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4,3"/>`;
  }

  // 数据点 + 天气图标 + 日期
  for (const p of dayPoints) {
    const icon = WEATHER_ICONS[p.weather] || '🌤️';
    const dateLabel = p.date ? p.date.slice(5) : ''; // MM-DD

    svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#f59e0b"/>`;
    svg += `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" fill="#f59e0b" font-size="10" font-weight="600">${p.temp}°</text>`;
    svg += `<text x="${p.x}" y="${p.y + 16}" text-anchor="middle" font-size="12">${icon}</text>`;
    if (dateLabel) {
      svg += `<text x="${p.x}" y="${height - 6}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="8">${dateLabel}</text>`;
    }
  }

  // 图例
  svg += `<line x1="${padX}" y1="${height - 18}" x2="${padX + 16}" y2="${height - 18}" stroke="#f59e0b" stroke-width="2"/>`;
  svg += `<text x="${padX + 20}" y="${height - 15}" fill="rgba(255,255,255,0.5)" font-size="8">白天</text>`;
  svg += `<line x1="${padX + 50}" y1="${height - 18}" x2="${padX + 66}" y2="${height - 18}" stroke="#6366f1" stroke-width="2" stroke-dasharray="4,3"/>`;
  svg += `<text x="${padX + 70}" y="${height - 15}" fill="rgba(255,255,255,0.5)" font-size="8">夜间</text>`;

  svg += '</svg>';
  return svg;
}

/**
 * 将天气图表插入到指定容器
 */
export function mountWeatherChart(containerId, weatherInfo) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const svg = renderWeatherChart(weatherInfo);
  if (svg) {
    container.innerHTML = svg;
    container.style.display = 'block';
  }
}

window._renderWeatherChart = renderWeatherChart;
window._mountWeatherChart = mountWeatherChart;
