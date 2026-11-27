import { config } from './config.js';
import { fields, labels, read, units, weather, write } from './data.js';
import { buildForecast } from './merge.js';
import { fetchForecast } from './sources/index.js';
import { currentPlace, searchPlaces } from './places.js';
import { evaluate, saveForecasts, seedMockHistory } from './verify.js';
import { drawChart, hourAt } from './chart.js';

const $ = id => document.getElementById(id);
const state = {
  place: config.places.find(p => p.id === config.defaultPlace) ?? config.places[0],
  mock: config.useMock, sources: [], errors: [], now: Date.now(), hour: 0, day: 0,
  metric: 'temp', compare: 'hour', run: 0, verificationRun: 0, searchRun: 0, suggestions: {},
};
const initialWeights = Object.fromEntries(config.sources.map(source => [source.id, source.weight]));
const weightKey = () => 'weights:' + state.mock;
const weights = () => ({ ...initialWeights, ...read(weightKey(), {}) });
const sourceName = id => config.sources.find(source => source.id === id)?.name ?? id;
const value = (number, field) => !Number.isFinite(number) ? '—' : field === 'weatherCode'
  ? weather[number]?.[1] ?? '—' : Number(number.toFixed(['precipProb', 'temp'].includes(field) ? 0 : 1)) + units[field];
const digits = (number, unit = '') => Number.isFinite(number) ? number.toFixed(1) + unit : '—';
const badge = level => '<span class="' + (['high', 'mid', 'low'][level] ?? 'unknown') + '">' +
  (['高', '中', '要注意'][level] ?? '比較不足') + '</span>';
let view;
const dateLabel = time => new Intl.DateTimeFormat('ja-JP', {
  timeZone: state.place.zone, month: 'numeric', day: 'numeric', weekday: 'short',
}).format(time);
const timeLabel = time => new Intl.DateTimeFormat('ja-JP', {
  timeZone: state.place.zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(time);
const dateString = date => date.slice(5).replace(/^0/, '').replace('-0', '/').replace('-', '/');
const swatch = color => '<span class="swatch"' + (color ? ' style="--swatch:' + color + '"' : '') + '></span>';

function renderDays() {
  $('days').innerHTML = view.days.map((day, index) => {
    const [symbol, description] = weather[day.weatherCode] ?? ['—', 'データなし'];
    const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(day.date + 'T00:00:00Z'));
    return '<button class="day" data-day="' + index + '" aria-pressed="' + (state.compare === 'day' && state.day === index) +
      '"><span class="day-date">' + (index === 0 ? '今日 ' : weekday + ' ') + dateString(day.date) +
      '</span><span class="weather ' + (day.weatherCode === 0 ? 'sun' : '') + '" role="img" aria-label="' + description +
      '" title="' + description + '">' + symbol + '</span><span class="day-temp">' + value(day.temp, 'temp') +
      ' <small>/ ' + value(day.low, 'temp') + '</small></span><span class="pop">降水 ' + value(day.precipProb, 'precipProb') +
      '</span>' + badge(day.severity) + '</button>';
  }).join('');
}

function renderChart() {
  if (!view) return;
  drawChart($('chart'), view.hours, state.metric, state.hour, timeLabel);
}

function renderHour() {
  const hour = view.hours[state.hour];
  $('hour-label').textContent = dateLabel(hour.time) + ' ' + timeLabel(hour.time);
  $('hour').value = state.hour;
  $('hour').setAttribute('aria-valuetext', $('hour-label').textContent);
  $('hour-details').innerHTML = fields.map(field => {
    const stat = hour.stats[field];
    const unit = units[field] ?? '';
    return '<div class="stat">' + labels[field] + '<b>' + value(hour[field], field) + '</b>' +
      badge(stat.severity) + (field === 'precipMm' && hour.split ? ' <span class="low">割れ</span>' : '') +
      '<small>最大差 ' + digits(stat.range, unit) + ' · σ ' + digits(stat.sd, unit) +
      '</small><small>' + stat.count + ' ソース</small></div>';
  }).join('');
  renderChart();
}

const makeTable = (columns, rows) => '<thead><tr>' + columns.map(cell => '<th scope="col">' + cell + '</th>').join('') +
  '</tr></thead><tbody>' + rows.map(([first, ...rest]) => '<tr><th scope="row">' + first + '</th>' +
  rest.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</tbody>';

function renderComparison() {
  const daily = state.compare === 'day';
  const selection = daily ? view.days[state.day] : view.hours[state.hour];
  $('compare-day').setAttribute('aria-pressed', daily);
  $('compare-hour').setAttribute('aria-pressed', !daily);
  $('comparison-caption').textContent = daily ? dateString(selection.date) + ' · 日最高 / 最低と日別降水確率' :
    dateLabel(selection.time) + ' ' + timeLabel(selection.time) + (selection.split ? ' · 降水の有無に割れ' : '');
  const currentWeights = weights();
  const cells = record => daily
    ? [value(record?.temp, 'temp'), value(record?.low, 'temp'), value(record?.precipProb, 'precipProb'), value(record?.weatherCode, 'weatherCode')]
    : fields.map(field => value(record?.[field], field));
  $('sources').innerHTML = makeTable(['ソース', '重み',
    ...(daily ? ['最高気温', '最低気温', '降水確率', '天気'] : fields.map(field => labels[field]))],
  [['統合値', '—', ...cells(selection)], ...config.sources.map(source => [
    swatch(source.color) + source.name, currentWeights[source.id], ...cells(selection.rows.find(row => row.source === source.id)),
  ])]);
}

function renderForecast() {
  const { place, now, sources } = state;
  view = buildForecast(sources, weights(), now, place.zone);
  $('place').textContent = place.name;
  $('region').textContent = place.region ?? '';
  $('date').textContent = dateLabel(now) + ' · ' + place.zone;
  $('legend').innerHTML = '<span>' + swatch() + '統合値</span>' + config.sources.filter(source =>
    view.hours.some(hour => hour.rows.some(row => row.source === source.id && Number.isFinite(row[state.metric]))))
    .map(source => '<span>' + swatch(source.color) + source.name + '</span>').join('') +
    (view.hours.some(hour => hour.split) ? '<span>' + swatch('var(--bad)') + '割れ</span>' : '');
  renderDays();
  renderHour();
  renderComparison();
}

async function refresh() {
  const run = ++state.run;
  state.verificationRun++;
  const { place, mock } = state;
  const now = Date.now();
  state.now = now;
  state.sources = [];
  state.suggestions = {};
  $('apply').disabled = true;
  $('sample').hidden = !mock;
  $('verify').disabled = true;
  $('ranking').hidden = true;
  $('verification-status').textContent = '保存した予報を確認しています…';
  $('source-errors').hidden = true;
  $('status').textContent = (mock ? 'モック · ' : '') + '予報を取得しています…';
  $('mode').textContent = mock ? '実APIに切り替え' : 'モックで試す';
  renderForecast();
  const { sources, errors } = await fetchForecast(place, mock, now);
  if (run !== state.run) return;
  state.sources = sources;
  const saved = saveForecasts(place, mock, sources, now);
  $('status').textContent = (mock ? 'モック · ' : '実API · ') +
    (sources.length ? sources.length + ' / ' + config.sources.length + ' ソースを取得' : '予報を取得できませんでした') +
    (saved ? '' : ' · このブラウザに予報を保存できません');
  $('source-errors').hidden = !errors.length;
  const details = document.createElement('details');
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = errors.length + ' ソースをスキップ';
  details.append(summary);
  const list = document.createElement('ul');
  for (const error of errors) {
    const item = document.createElement('li');
    item.textContent = sourceName(error.id) + ' · ' + error.reason;
    list.append(item);
  }
  details.append(list);
  $('source-errors').replaceChildren(details);
  renderForecast();
  $('verify').disabled = false;
  refreshVerification();
}

async function refreshVerification(seed = false) {
  const run = ++state.verificationRun;
  const { place, mock, now } = state;
  $('verify').disabled = true;
  $('sample').disabled = true;
  $('apply').disabled = true;
  $('ranking').hidden = true;
  $('verification-status').textContent = '検証しています…';
  try {
    if (seed) await seedMockHistory(place, now);
    const { rankings, suggestions } = await evaluate(place, mock, now);
    if (run !== state.verificationRun) return;
    state.suggestions = suggestions;
    const hasRows = rankings.some(item => item.counts.some(Boolean));
    $('ranking').hidden = !hasRows;
    $('verification-status').textContent = (mock ? 'モック検証 · ' : '') +
      (rankings.some(item => item.hit != null) ? '降水有無の的中率順（6〜24時間前の予報）' :
        'データ不足 · 過去7日で一致する時刻が各ソース ' + config.minimumSamples + ' 件以上必要です');
    let position = 0;
    $('ranking').innerHTML = makeTable(['順位 / ソース', '的中率（件数）', '気温 MAE（件数）',
      '降水量 MAE（件数）', '風速 MAE（件数）', '提案の重み'], rankings.map(item => [
      (item.hit == null ? '—' : ++position) + '　' + sourceName(item.id),
      digits(item.hit, '%') + '（' + item.counts[1] + '）',
      ...item.mae.map((error, i) => digits(error, ['°C', 'mm', 'km/h'][i]) + '（' + item.counts[i] + '）'),
      suggestions[item.id] ?? '—',
    ]));
    $('apply').disabled = Object.keys(suggestions).length < 2;
  } catch (error) {
    if (run === state.verificationRun) $('verification-status').textContent = '検証できません · ' + error.message;
  } finally {
    if (run === state.verificationRun) {
      $('verify').disabled = false;
      $('sample').disabled = false;
    }
  }
}

function selectPlace(place) {
  state.searchRun++;
  $('search-results').hidden = true;
  state.place = place;
  state.day = state.hour = 0;
  refresh();
}

$('search').addEventListener('submit', async event => {
  event.preventDefault();
  const query = $('query').value.trim();
  if (!query) return;
  const request = ++state.searchRun;
  const container = $('search-results');
  container.hidden = false;
  container.textContent = '検索中…';
  const result = await searchPlaces(query, state.mock);
  if (request !== state.searchRun) return;
  container.replaceChildren();
  if (result.message || !result.places.length) {
    const note = document.createElement('p');
    note.textContent = result.message ?? '該当する都市がありません';
    container.append(note);
  }
  for (const place of result.places) {
    const button = document.createElement('button');
    button.textContent = place.name + (place.region ? ' · ' + place.region : '');
    button.onclick = () => { $('query').value = ''; selectPlace(place); };
    container.append(button);
  }
});
document.addEventListener('pointerdown', event => {
  if (!$('search-results').hidden && !event.target.closest('.location-controls')) {
    state.searchRun++;
    $('search-results').hidden = true;
  }
});
$('geo').onclick = () => {
  const showError = message => {
    $('search-results').hidden = false;
    $('search-results').textContent = message;
  };
  if (!navigator.geolocation) return showError('現在地の取得には HTTPS と位置情報に対応したブラウザが必要です');
  const request = ++state.searchRun;
  $('geo').disabled = true;
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    $('geo').disabled = false;
    if (request === state.searchRun) selectPlace(currentPlace(coords.latitude, coords.longitude));
  }, error => {
    $('geo').disabled = false;
    if (request === state.searchRun) showError(['位置情報を取得できません', '位置情報の利用が許可されていません',
      '現在地を特定できません', '位置情報の取得がタイムアウトしました'][error.code]);
  }, { timeout: 8000, maximumAge: 300000 });
};
$('retry').onclick = refresh;
$('mode').onclick = () => {
  state.mock = !state.mock;
  state.searchRun++;
  $('search-results').hidden = true;
  refresh();
};
$('verify').onclick = () => refreshVerification();
$('sample').onclick = () => refreshVerification(true);
$('apply').onclick = () => {
  if (write(weightKey(), { ...weights(), ...state.suggestions })) {
    renderForecast();
    $('verification-status').textContent = '提案の重みを反映しました';
  } else $('verification-status').textContent = '重みを保存できませんでした';
};
$('reset').onclick = () => {
  if (write(weightKey(), {})) {
    renderForecast();
    $('verification-status').textContent = 'config.js の重みに戻しました';
  } else $('verification-status').textContent = '重みを保存できませんでした';
};

const metrics = fields.filter(field => field !== 'weatherCode');
$('metrics').innerHTML = metrics.map(field => '<button data-field="' + field + '" aria-pressed="' +
  (state.metric === field) + '">' + labels[field] + '</button>').join('');
$('metrics').onclick = event => {
  if (!event.target.dataset.field) return;
  state.metric = event.target.dataset.field;
  for (const button of $('metrics').children) button.setAttribute('aria-pressed', button === event.target);
  renderForecast();
};
function selectHour(index) {
  state.hour = index;
  state.compare = 'hour';
  renderHour();
  renderComparison();
  for (const button of $('days').children) button.setAttribute('aria-pressed', false);
}
$('hour').oninput = event => selectHour(+event.target.value);
$('chart').onclick = event => selectHour(hourAt($('chart'), event.offsetX));
$('days').onclick = event => {
  const button = event.target.closest('[data-day]');
  if (!button) return;
  state.day = +button.dataset.day;
  setComparison('day');
};
function setComparison(mode) {
  state.compare = mode;
  for (const button of $('days').children) button.setAttribute('aria-pressed', mode === 'day' && +button.dataset.day === state.day);
  renderComparison();
}
$('compare-hour').onclick = () => setComparison('hour');
$('compare-day').onclick = () => setComparison('day');

const theme = matchMedia('(prefers-color-scheme: dark)');
function updateTheme() {
  document.documentElement.dataset.theme = read('theme', theme.matches ? 'dark' : 'light');
  renderChart();
}
$('theme').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  write('theme', next);
  document.documentElement.dataset.theme = next;
  renderChart();
};
theme.addEventListener('change', updateTheme);
new ResizeObserver(renderChart).observe($('chart').parentNode);
updateTheme();
refresh();
