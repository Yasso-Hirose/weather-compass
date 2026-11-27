import { dayKey, fixture, fixtureEpoch, getJson, mockAnchor, numeric, row } from '../data.js';

function category(code) {
  if (!code) return null;
  if (code === '115' || code === '215') return 4;
  if (code === '140' || code === '160' || code === '240' || code === '260') return 5;
  const group = Number(code[0]);
  return [null, 0, 1, 3, 4][group] ?? null;
}

export async function jma(source, place, mock, now) {
  if (place.country !== 'JP' || !place.office) throw new Error('対象地域外（気象庁の地域コード未設定）');
  const url = source.baseUrl.replace('{office}', encodeURIComponent(place.office));
  const data = mock ? await fixture(source.id) : await getJson(url);
  const daily = new Map();
  const shifts = mock ? mockAnchor(now) - fixtureEpoch : 0;
  const dateAt = time => dayKey(Date.parse(time) + shifts, 'Asia/Tokyo');
  const day = date => {
    if (!daily.has(date)) daily.set(date, { ...row(source.id, Date.parse(date + 'T00:00:00+09:00')), date });
    return daily.get(date);
  };
  for (const [index, report] of data.entries()) {
    for (const series of report.timeSeries) {
      const area = mock ? series.areas[0] : series.areas.find(item => {
        if (item.temps || item.tempsMin || item.tempsMax) return item.area.code === place.station;
        return item.area.code === (index ? place.weekly : place.area) && (item.weatherCodes || item.pops);
      });
      if (!area) continue;
      series.timeDefines.forEach((time, i) => {
        const item = day(dateAt(time));
        if (area.weatherCodes?.[i] && (index === 0 || item.weatherCode == null)) {
          item.weatherCode = category(String(area.weatherCodes[i]));
        }
        const min = numeric(area.tempsMin?.[i] ?? (time.slice(11, 13) === '00' ? area.temps?.[i] : null));
        const max = numeric(area.tempsMax?.[i] ?? (time.slice(11, 13) === '09' ? area.temps?.[i] : null));
        if (min != null && (index === 0 || item.min == null)) item.min = min;
        if (max != null && (index === 0 || item.max == null)) item.max = item.temp = max;
        const probability = numeric(area.pops?.[i]);
        if (probability == null) return;
        if (index === 0) item.shortPop = Math.max(item.shortPop ?? 0, probability);
        else item.precipProb = probability;
      });
    }
  }
  return { hourly: [],
    daily: [...daily.values()].filter(item => item.weatherCode != null || item.precipProb != null || item.shortPop != null || item.max != null || item.min != null)
      .map(item => ({ ...item, precipProb: item.precipProb ?? item.shortPop })) };
}
