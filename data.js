import { config } from './config.js';

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const fields = ['temp', 'precipProb', 'precipMm', 'windSpeed', 'weatherCode'];
export const labels = { temp: '気温', precipProb: '降水確率', precipMm: '降水量', windSpeed: '風速', weatherCode: '天気' };
export const units = { temp: '°C', precipProb: '%', precipMm: 'mm', windSpeed: 'km/h' };
export const weather = [
  ['☀︎', '晴れ'], ['☁', 'くもり'], ['≋', '霧'], ['☂', '雨'], ['❄', '雪'], ['ϟ', '雷雨'],
];
export const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const row = (source, time, temp, precipProb, precipMm, windSpeed, weatherCode) => ({
  source, time, temp: numeric(temp), precipProb: numeric(precipProb), precipMm: numeric(precipMm),
  windSpeed: numeric(windSpeed), weatherCode: numeric(weatherCode),
});
const dates = new Map();
export function dayKey(time, zone) {
  if (!dates.has(zone)) dates.set(zone, new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }));
  return dates.get(zone).format(time);
}
export const shiftDay = (day, days) => new Date(Date.parse(day + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
export const placeKey = p => [p.lat, p.lon, p.zone, p.office, p.area, p.weekly, p.station].join('/');
export const urlWith = (base, query) => {
  const url = new URL(base, globalThis.location?.href || 'http://localhost/');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
};

export async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('タイムアウト（' + config.timeoutMs / 1000 + '秒）');
    if (error instanceof TypeError) throw new Error('接続不可（ネットワークまたは CORS）');
    if (error instanceof SyntaxError) throw new Error('JSON の形式が不正');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export const fixture = name => getJson(new URL('./mock/' + name + '.json', import.meta.url));
export const fixtureEpoch = Date.parse('2025-01-13T00:00:00Z');
export const mockAnchor = now => Math.floor(now / DAY) * DAY;

export function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem('forecast-v1:' + key)) ?? fallback; }
  catch { return fallback; }
}
export function write(key, value) {
  try { localStorage.setItem('forecast-v1:' + key, JSON.stringify(value)); return true; }
  catch { return false; }
}
