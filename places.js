import { config } from './config.js';
import { getJson, urlWith } from './data.js';

function localMatch(query) {
  const normal = query.toLowerCase();
  return config.places.filter(place => (place.name + ' ' + place.aliases).toLowerCase().includes(normal));
}

export async function searchPlaces(query, mock) {
  const local = localMatch(query);
  if (mock) return { places: local };
  try {
    const data = await getJson(urlWith(config.searchUrl, { name: query, count: 8, language: 'ja', format: 'json' }));
    const remote = (data.results ?? []).map(item => {
      const near = config.places.find(p => p.country === item.country_code &&
        Math.hypot(p.lat - item.latitude, p.lon - item.longitude) < 0.12);
      if (near) return near;
      return { id: 'geo-' + item.id, name: item.name, region: [item.admin1, item.country].filter(Boolean).join('・'),
        lat: item.latitude, lon: item.longitude, zone: item.timezone ?? 'UTC', country: item.country_code };
    });
    return { places: [...new Map([...local, ...remote].map(place => [place.id, place])).values()] };
  } catch (error) {
    return { places: local, message: '都市検索 API · ' + error.message };
  }
}

export function currentPlace(lat, lon) {
  const near = config.places.find(p => Math.hypot(p.lat - lat, p.lon - lon) < 0.12);
  return { ...near, id: 'current', name: '現在地', region: near?.name, lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)), zone: near?.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone };
}
