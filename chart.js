import { config } from './config.js';
import { units } from './data.js';

const margins = { left: 50, right: 13, top: 15, bottom: 29 };
export const hourAt = (canvas, x) => Math.max(0, Math.min(47, Math.round((x - margins.left) * 47 /
  (canvas.clientWidth - margins.left - margins.right))));

export function drawChart(canvas, hours, field, selected, formatTime) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const style = getComputedStyle(canvas);
  const color = name => style.getPropertyValue(name).trim();
  const series = config.sources.map(source => ({
    color: source.color, points: hours.map(hour => hour.rows.find(row => row.source === source.id)?.[field]),
  }));
  series.push({ color: color('--accent'), points: hours.map(hour => hour[field]), main: true });
  const values = series.flatMap(line => line.points.filter(Number.isFinite));
  if (!values.length) {
    ctx.fillStyle = color('--muted');
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('表示できるデータがありません', width / 2, height / 2);
    return;
  }
  const min = field === 'temp' ? Math.floor(Math.min(...values) - 1) : 0;
  const max = field === 'precipProb' ? 100 : Math.max(min + 1, Math.ceil(Math.max(...values) + 0.5));
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;
  const x = i => margins.left + plotW * i / 47;
  const y = value => margins.top + plotH * (max - value) / (max - min);
  ctx.font = '11px system-ui';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4;
    ctx.strokeStyle = color('--grid');
    ctx.beginPath();
    ctx.moveTo(x(0), y(value));
    ctx.lineTo(x(47), y(value));
    ctx.stroke();
    ctx.fillStyle = color('--muted');
    ctx.fillText(Number(value.toFixed(1)) + units[field], x(0) - 5, y(value));
  }
  ctx.textAlign = 'center';
  const step = width > 600 ? 6 : 12;
  for (let i = 0; i < hours.length; i += step) {
    ctx.fillText(formatTime(hours[i].time), x(i), height - 10);
  }
  ctx.fillStyle = color('--bad');
  for (const [index, hour] of hours.entries()) {
    if (hour.split) ctx.fillRect(x(index) - 1, 4, 3, 4);
  }
  ctx.strokeStyle = color('--muted');
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x(selected), y(min));
  ctx.lineTo(x(selected), y(max));
  ctx.stroke();
  ctx.setLineDash([]);
  for (const line of series) {
    ctx.lineWidth = line.main ? 2.6 : 1.25;
    ctx.globalAlpha = line.main ? 1 : 0.48;
    ctx.strokeStyle = line.color;
    ctx.fillStyle = line.color;
    ctx.beginPath();
    let started = false;
    for (const [index, value] of line.points.entries()) {
      if (!Number.isFinite(value)) { started = false; continue; }
      if (started) ctx.lineTo(x(index), y(value));
      else ctx.moveTo(x(index), y(value));
      started = true;
    }
    ctx.stroke();
    if (Number.isFinite(line.points[selected])) {
      ctx.beginPath();
      ctx.arc(x(selected), y(line.points[selected]), line.main ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
