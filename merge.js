import { config } from './config.js';
import { HOUR, dayKey, fields, shiftDay } from './data.js';

export function weightedMedian(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const halfway = sorted.reduce((sum, e) => sum + e.weight, 0) / 2;
  let sum = 0;
  for (const [index, sample] of sorted.entries()) {
    sum += sample.weight;
    if (Math.abs(sum - halfway) < 1e-9 && sorted[index + 1]) {
      return (sample.value + sorted[index + 1].value) / 2;
    }
    if (sum >= halfway) return sample.value;
  }
  return sorted.at(-1).value;
}

function vote(samples) {
  const counts = new Map();
  for (const { value, weight } of samples) counts.set(value, (counts.get(value) ?? 0) + weight);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

export function combine(rows, weights) {
  const result = { stats: {}, split: false };
  for (const field of fields) {
    const samples = rows.filter(row => Number.isFinite(row[field]) && weights[row.source] > 0)
      .map(row => ({ value: row[field], weight: weights[row.source] }));
    const values = samples.map(entry => entry.value);
    const count = values.length;
    const average = count ? values.reduce((sum, value) => sum + value, 0) / count : null;
    const range = count ? Math.max(...values) - Math.min(...values) : null;
    const sd = count ? Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / count) : null;
    const [medium, large] = config.spread[field];
    // 天気カテゴリのコード順に物理的な意味はない。相違の種類数で信頼度を判定する。
    const differences = new Set(values).size;
    const severity = field === 'weatherCode'
      ? Math.min(2, differences - 1)
      : Number(range >= medium || sd >= medium / 2) + Number(range >= large || sd >= large / 2);
    result.stats[field] = { count, range, sd, severity: count >= 2 ? severity : null };
    result[field] = field === 'weatherCode' ? vote(samples)
      : field === 'precipProb' ? (count ? samples.reduce((sum, e) => sum + e.weight * e.value, 0) /
        samples.reduce((sum, e) => sum + e.weight, 0) : null)
      : weightedMedian(samples);
  }
  const wet = rows.filter(row => weights[row.source] > 0).map(row => {
    if (Number.isFinite(row.precipMm)) return row.precipMm >= config.rainThresholdMm;
    return Number.isFinite(row.weatherCode) ? row.weatherCode >= 3 : null;
  });
  result.split = wet.includes(true) && wet.includes(false);
  result.severity = confidence(Object.values(result.stats));
  return result;
}

function confidence(stats) {
  const levels = stats.map(stat => stat.severity).filter(Number.isInteger);
  return levels.length ? Math.max(...levels) : null;
}

export function buildForecast(sources, weights, now, zone) {
  const start = Math.floor(now / HOUR) * HOUR;
  const today = dayKey(now, zone);
  const grouped = new Map();
  for (const source of sources) {
    for (const row of source.hourly) {
      if (!grouped.has(row.time)) grouped.set(row.time, []);
      grouped.get(row.time).push(row);
    }
  }
  const hours = Array.from({ length: 48 }, (_, i) => {
    const time = start + i * HOUR;
    const rows = grouped.get(time) ?? [];
    return { time, rows, ...combine(rows, weights) };
  });
  const byDay = new Map(sources.map(source => {
    const dates = new Map();
    for (const row of source.hourly) {
      const date = dayKey(row.time, zone);
      if (!dates.has(date)) dates.set(date, []);
      dates.get(date).push(row);
    }
    return [source.id, dates];
  }));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(today, i);
    const rows = sources.map(source => {
      const hourly = byDay.get(source.id).get(date) ?? [];
      const temps = hourly.map(row => row.temp).filter(Number.isFinite);
      const probs = hourly.map(row => row.precipProb).filter(Number.isFinite);
      const daily = source.daily?.find(row => row.date === date);
      const peak = temps.length ? Math.max(...temps) : null;
      const low = temps.length ? Math.min(...temps) : null;
      return {
        source: source.id, temp: daily?.max ?? peak, low: daily?.min ?? low,
        precipProb: daily?.precipProb ?? (probs.length ? Math.max(...probs) : null),
        weatherCode: daily?.weatherCode ?? vote(hourly.filter(row => row.weatherCode != null)
          .map(row => ({ value: row.weatherCode, weight: 1 }))),
      };
    });
    const combined = combine(rows, weights);
    const lows = combine(rows.map(row => ({ source: row.source, temp: row.low })), weights);
    return { date, rows, ...combined, low: lows.temp, severity: confidence([
      ...['temp', 'precipProb', 'weatherCode'].map(key => combined.stats[key]), lows.stats.temp,
    ]) };
  });
  return { hours, days };
}
