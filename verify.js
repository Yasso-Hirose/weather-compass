import { config } from './config.js';
import { DAY, HOUR, dayKey, fixture, fixtureEpoch, getJson, mockAnchor, placeKey, read, shiftDay, urlWith, write } from './data.js';
import { fetchForecast } from './sources/index.js';

const evaluateFields = {
  temp: 'temperature_2m', precipMm: 'precipitation', windSpeed: 'wind_speed_10m',
};
const forecastKey = (place, mock) => 'samples:' + mock + ':' + placeKey(place);
const historyCache = new Map();

export function saveForecasts(place, mock, sources, now) {
  if (!sources.length) return true;
  const stored = read(forecastKey(place, mock), {});
  const cutoff = now - 10 * DAY;
  for (const id of Object.keys(stored)) {
    for (const time of Object.keys(stored[id])) {
      if (+time < cutoff) delete stored[id][time];
    }
  }
  for (const source of sources) {
    const values = stored[source.id] ??= {};
    for (const sample of source.hourly) {
      const lead = sample.time - source.fetchedAt;
      if (lead < 6 * HOUR || lead > 24 * HOUR || !Object.keys(evaluateFields).some(key => Number.isFinite(sample[key]))) continue;
      if ((values[sample.time]?.[0] ?? 0) >= source.fetchedAt) continue;
      values[sample.time] = [source.fetchedAt, sample.temp, sample.precipMm, sample.windSpeed];
    }
  }
  const latestKey = 'latest:' + mock + ':' + placeKey(place);
  const latest = read(latestKey, {});
  for (const source of sources) {
    if ((latest[source.id]?.fetchedAt ?? 0) > source.fetchedAt) continue;
    latest[source.id] = {
      fetchedAt: source.fetchedAt,
      hourly: source.hourly.filter(item => item.time >= Math.floor(now / HOUR) * HOUR)
        .map(item => [item.time, item.temp, item.precipProb, item.precipMm, item.windSpeed, item.weatherCode]),
      daily: source.daily ?? [],
    };
  }
  const saved = write(forecastKey(place, mock), stored);
  return write(latestKey, latest) && saved;
}

async function history(place, mock, from, to, now) {
  const key = JSON.stringify([mock, placeKey(place), from, to, config.historyUrl]);
  const cached = historyCache.get(key);
  if (cached && now - cached.time < config.cacheMinutes * 60000) return cached.rows;
  const data = mock ? await fixture('history') : await getJson(urlWith(config.historyUrl, {
    latitude: place.lat, longitude: place.lon, timezone: 'GMT', timeformat: 'unixtime',
    hourly: Object.values(evaluateFields).join(','), wind_speed_unit: 'kmh',
    start_date: from, end_date: to,
  }));
  const shift = mock ? mockAnchor(now) - fixtureEpoch : 0;
  const h = data.hourly;
  const rows = new Map(h.time.map((time, i) => [time * 1000 + shift,
    Object.values(evaluateFields).map(field => h[field]?.[i])]));
  historyCache.set(key, { time: now, rows });
  if (historyCache.size > 25) historyCache.delete(historyCache.keys().next().value);
  return rows;
}

export async function evaluate(place, mock, now) {
  const today = dayKey(now, place.zone);
  const firstDay = shiftDay(today, -7);
  const lastDay = shiftDay(today, -1);
  const snapshots = read(forecastKey(place, mock), {});
  if (!Object.values(snapshots).some(values => Object.keys(values).some(time => {
    const date = dayKey(+time, place.zone);
    return date >= firstDay && date <= lastDay;
  }))) return { rankings: [], suggestions: {} };

  // UTC で両端に余裕を持たせ、地点の暦日で照合する。
  const from = shiftDay(firstDay, -1);
  const to = dayKey(now, 'UTC');
  let actual;
  try {
    actual = await history(place, mock, from, to, now);
  } catch (error) {
    if (mock || !/^HTTP (400|404)$/.test(error.message)) throw error;
    // 直近データを提供しないモデル・地点でも、利用可能な日付まで試す。
    const available = shiftDay(to, -5);
    actual = await history(place, false, from, available, now);
  }

  const rankings = config.sources.map(source => {
    const sums = [0, 0, 0];
    const counts = [0, 0, 0];
    let hits = 0;
    for (const [time, observed] of actual) {
      const predicted = snapshots[source.id]?.[time];
      if (!predicted) continue;
      const date = dayKey(time, place.zone);
      if (date < firstDay || date > lastDay) continue;
      observed.forEach((value, i) => {
        const estimate = predicted[i + 1];
        if (!Number.isFinite(value) || !Number.isFinite(estimate)) return;
        sums[i] += Math.abs(value - estimate);
        counts[i]++;
        if (i === 1 && (value >= config.rainThresholdMm) === (estimate >= config.rainThresholdMm)) hits++;
      });
    }
    return { id: source.id, counts, mae: sums.map((sum, i) => counts[i] ? sum / counts[i] : null),
      hit: counts[1] >= config.minimumSamples ? hits * 100 / counts[1] : null };
  }).sort((a, b) => (b.hit ?? -1) - (a.hit ?? -1) || b.counts[1] - a.counts[1]);

  const eligible = rankings.filter(item => item.counts[0] >= config.minimumSamples);
  const suggestions = {};
  if (eligible.length >= 2) {
    const raw = eligible.map(item => 1 / Math.max(0.25, item.mae[0]));
    const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
    eligible.forEach((item, i) => {
      suggestions[item.id] = Math.round(Math.max(0.25, Math.min(3, raw[i] / mean)) * 100) / 100;
    });
  }
  return { rankings, suggestions };
}

export async function seedMockHistory(place, now) {
  for (const offset of [4, 3]) {
    const captured = Math.floor(now / DAY) * DAY - offset * DAY;
    const { sources } = await fetchForecast(place, true, captured);
    if (!sources.length || !saveForecasts(place, true, sources, captured)) throw new Error('モック予報を保存できません');
  }
}
