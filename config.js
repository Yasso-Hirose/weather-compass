export const config = {
  useMock: false,
  // 通信障害の確認用。モック・実APIの両方で指定IDを失敗させる。
  simulateFailures: [],
  cacheMinutes: 20,
  timeoutMs: 8000,
  defaultPlace: 'tokyo',
  rainThresholdMm: 0.1,
  minimumSamples: 24,
  searchUrl: 'https://geocoding-api.open-meteo.com/v1/search',
  historyUrl: 'https://archive-api.open-meteo.com/v1/archive',
  places: [
    { id: 'tokyo', name: '東京', aliases: 'Tokyo 東京都', lat: 35.6895, lon: 139.6917, zone: 'Asia/Tokyo', country: 'JP', office: '130000', area: '130010', station: '44132', weekly: '130000' },
    { id: 'osaka', name: '大阪', aliases: 'Osaka 大阪府', lat: 34.6937, lon: 135.5023, zone: 'Asia/Tokyo', country: 'JP', office: '270000', area: '270000', station: '62078', weekly: '270000' },
    { id: 'sapporo', name: '札幌', aliases: 'Sapporo 北海道', lat: 43.0618, lon: 141.3545, zone: 'Asia/Tokyo', country: 'JP', office: '016000', area: '016010', station: '14163', weekly: '016000' },
    { id: 'fukuoka', name: '福岡', aliases: 'Fukuoka 福岡県', lat: 33.5902, lon: 130.4017, zone: 'Asia/Tokyo', country: 'JP', office: '400000', area: '400010', station: '82182', weekly: '400000' },
    { id: 'nagoya', name: '名古屋', aliases: 'Nagoya 愛知県', lat: 35.1815, lon: 136.9066, zone: 'Asia/Tokyo', country: 'JP', office: '230000', area: '230010', station: '51106', weekly: '230000' },
    { id: 'naha', name: '那覇', aliases: 'Naha 沖縄県', lat: 26.2124, lon: 127.6809, zone: 'Asia/Tokyo', country: 'JP', office: '471000', area: '471010', station: '91197', weekly: '471000' },
    { id: 'london', name: 'ロンドン', aliases: 'London', lat: 51.5073, lon: -0.1276, zone: 'Europe/London', country: 'GB' },
  ],
  sources: [
    { id: 'ecmwf', name: 'ECMWF', type: 'openMeteo', model: 'ecmwf_ifs025', baseUrl: 'https://api.open-meteo.com/v1/forecast', weight: 1, color: '#426edb' },
    { id: 'gfs', name: 'GFS', type: 'openMeteo', model: 'gfs_seamless', baseUrl: 'https://api.open-meteo.com/v1/forecast', weight: 1, color: '#12816d' },
    { id: 'icon', name: 'ICON', type: 'openMeteo', model: 'icon_seamless', baseUrl: 'https://api.open-meteo.com/v1/forecast', weight: 1, color: '#9a59c7' },
    { id: 'jma-model', name: 'JMA モデル', type: 'openMeteo', model: 'jma_seamless', baseUrl: 'https://api.open-meteo.com/v1/forecast', weight: 1, color: '#bb5c2e' },
    { id: 'met', name: 'MET Norway', type: 'met', baseUrl: 'https://api.met.no/weatherapi/locationforecast/2.0/complete', weight: 1, color: '#a65770' },
    { id: 'jma', name: '気象庁', type: 'jma', baseUrl: 'https://www.jma.go.jp/bosai/forecast/data/forecast/{office}.json', weight: 1, color: '#8c770e' },
  ],
  // [中と判定する最大差, 大と判定する最大差]。標準偏差の境界は各値の半分。
  spread: { temp: [2, 5], precipProb: [20, 45], precipMm: [0.5, 2], windSpeed: [8, 18], weatherCode: [1, 2] },
};
