import { fixture, fixtureEpoch, getJson, mockAnchor, row, urlWith } from '../data.js';

const requested = 'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code';
export function wmo(code) {
  if (!Number.isFinite(code)) return null;
  if (code === 0) return 0;
  if (code <= 3) return 1;
  if (code === 45 || code === 48) return 2;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 4;
  return code >= 95 ? 5 : 3;
}

export async function openMeteo(source, place, mock, now) {
  const data = mock ? await fixture(source.id) : await getJson(urlWith(source.baseUrl, {
    latitude: place.lat, longitude: place.lon, models: source.model, hourly: requested,
    timezone: 'GMT', timeformat: 'unixtime', forecast_days: 9, past_days: 1, wind_speed_unit: 'kmh',
  }));
  const h = data.hourly;
  const shift = mock ? mockAnchor(now) - fixtureEpoch : 0;
  return { hourly: h.time.map((time, index) => row(source.id, time * 1000 + shift, h.temperature_2m?.[index],
    h.precipitation_probability?.[index], h.precipitation?.[index], h.wind_speed_10m?.[index],
    wmo(h.weather_code?.[index]))) };
}
