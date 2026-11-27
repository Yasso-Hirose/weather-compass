import { config } from '../config.js';
import { HOUR, placeKey } from '../data.js';
import { jma } from './jma.js';
import { met } from './met.js';
import { openMeteo } from './open-meteo.js';

const adapters = { openMeteo, met, jma };
const cache = new Map();

export async function fetchForecast(place, mock, now) {
  const results = await Promise.allSettled(config.sources.map(async source => {
    if (config.simulateFailures.includes(source.id)) throw new Error('設定による通信エラー');
    const key = JSON.stringify([mock, placeKey(place), source.id, source.baseUrl, source.model]);
    const stored = cache.get(key);
    if (stored && now >= stored.fetchedAt && now - stored.fetchedAt < config.cacheMinutes * 60000) return stored;
    const output = await adapters[source.type](source, place, mock, now);
    if (!output.hourly.some(item => item.time >= Math.floor(now / HOUR) * HOUR &&
      [item.temp, item.precipProb, item.precipMm, item.windSpeed, item.weatherCode].some(Number.isFinite))
      && !output.daily?.length) throw new Error('有効な予報データなし');
    const result = { ...output, id: source.id, fetchedAt: now };
    cache.set(key, result);
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return result;
  }));
  const sources = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') sources.push(result.value);
    else errors.push({ id: config.sources[index].id, reason: result.reason?.message ?? '取得エラー' });
  });
  return { sources, errors };
}
