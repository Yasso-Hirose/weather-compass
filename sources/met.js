import { HOUR, dayKey, fixture, fixtureEpoch, getJson, mockAnchor, row, urlWith } from '../data.js';

function symbol(code) {
  if (!code) return null;
  if (code.includes('thunder')) return 5;
  if (/snow|sleet/.test(code)) return 4;
  if (code.includes('rain')) return 3;
  if (code.includes('fog')) return 2;
  return code.startsWith('clearsky') ? 0 : 1;
}

export async function met(source, place, mock, now) {
  const data = mock ? await fixture(source.id) : await getJson(urlWith(source.baseUrl, {
    lat: place.lat.toFixed(4), lon: place.lon.toFixed(4),
  }));
  const shift = mock ? mockAnchor(now) - fixtureEpoch : 0;
  const rows = new Map();
  const dailyCodes = new Map();
  for (const entry of data.properties.timeseries) {
    const time = Date.parse(entry.time) + shift;
    const instant = entry.data.instant.details;
    const one = entry.data.next_1_hours;
    const six = entry.data.next_6_hours;
    // 降水量は区間の終了時刻に置く。6時間量を1時間量へ按分しない。
    const instantRow = rows.get(time) ?? row(source.id, time);
    instantRow.temp = Number.isFinite(instant.air_temperature) ? instant.air_temperature : null;
    instantRow.windSpeed = Number.isFinite(instant.wind_speed) ? instant.wind_speed * 3.6 : null;
    rows.set(time, instantRow);
    if (one) {
      instantRow.weatherCode = symbol(one.summary?.symbol_code);
      instantRow.precipProb = one.details?.probability_of_precipitation ?? null;
    }
    const code = symbol((one ?? six)?.summary?.symbol_code);
    if (code != null) {
      for (let offset = 0; offset < (one ? 1 : 6); offset++) {
        const date = dayKey(time + offset * HOUR, place.zone);
        if (!dailyCodes.has(date)) dailyCodes.set(date, new Map());
        const counts = dailyCodes.get(date);
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    if (one && Number.isFinite(one.details?.precipitation_amount)) {
      const end = time + HOUR;
      const record = rows.get(end) ?? row(source.id, end);
      record.precipMm = one.details.precipitation_amount;
      rows.set(end, record);
    }
  }
  return { hourly: [...rows.values()], daily: [...dailyCodes].map(([date, counts]) => ({
    date, weatherCode: [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0],
  })) };
}
