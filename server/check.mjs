// GitHub Actionsから15分ごとに呼ばれる確認スクリプト。
// レートを取得 → アプリと同じロジックでシグナル判定 → 新しいシグナルだけWeb Pushで送る。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

const require = createRequire(import.meta.url);
const { analyze, IND_NAME, DEC, TF_MS } = require('./core.cjs');

const BASE_URL = process.env.TWELVE_DATA_BASE || 'https://api.twelvedata.com';
const STATE_DIR = process.env.FX_STATE_DIR || 'state';
const STATE_FILE = path.join(STATE_DIR, 'seen.json');
const TF_LABEL = { '15min': '15分足', '1h': '1時間足', '4h': '4時間足' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// ---- 設定の読み込み(Secret FX_CONFIG) ----
let cfg;
try {
  cfg = JSON.parse(process.env.FX_CONFIG || '');
} catch {
  fail('Secret「FX_CONFIG」が空か、JSONとして読めません。アプリの「サーバー連携」で作った文字列を貼り直してください。');
}
const sub = cfg.subscription;
if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
  fail('FX_CONFIG にプッシュの購読情報がありません。アプリで「プッシュ通知を準備する」をやり直してください。');
}
if (!cfg.vapid || !cfg.vapid.publicKey || !cfg.vapid.privateKey) {
  fail('FX_CONFIG にVAPID鍵がありません。アプリで「プッシュ通知を準備する」をやり直してください。');
}
if (!/^https:\/\//.test(cfg.siteUrl || '')) {
  fail('FX_CONFIG の siteUrl がHTTPSのURLではありません。公開したURLでアプリを開いて作り直してください。');
}
webpush.setVapidDetails(cfg.siteUrl, cfg.vapid.publicKey, cfg.vapid.privateKey);

async function push(payload) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
    return { ok: true };
  } catch (e) {
    return { ok: false, status: e.statusCode, msg: String(e.body || e.message || e).slice(0, 200) };
  }
}

// ---- テスト通知だけ送るモード ----
if (process.env.TEST_PUSH) {
  const r = await push({ title: 'テスト通知', body: 'サーバーからのプッシュ通知が届いています。', tag: 'fx-test' });
  if (r.ok) {
    console.log('テスト通知を送信しました。');
    process.exit(0);
  }
  fail(`テスト通知の送信に失敗しました(status ${r.status ?? '-'}): ${r.msg}`);
}

// ---- 通常の確認 ----
if (!cfg.apiKey) fail('FX_CONFIG にTwelve DataのAPIキーがありません。アプリの設定でキーを入れてから作り直してください。');
if (!Array.isArray(cfg.pairs) || !cfg.pairs.length) fail('FX_CONFIG に監視する通貨ペアがありません。');
if (!TF_MS[cfg.tf]) fail(`FX_CONFIG の時間足「${cfg.tf}」には対応していません。`);

const acfg = {
  window: Number(cfg.window) || 3,
  minStrength: Number(cfg.minStrength) || 2,
  ind: cfg.ind || { ma: true, macd: true, rsi: true, bb: true },
};

async function fetchBars(pair) {
  const url =
    `${BASE_URL}/time_series?symbol=${encodeURIComponent(pair)}&interval=${cfg.tf}` +
    `&outputsize=120&order=ASC&apikey=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const j = await res.json();
  if (j.status === 'error') throw new Error(j.message || 'APIエラー');
  if (!j.values || !j.values.length) throw new Error('データが空でした');
  return j.values.map((x) => ({
    t: Date.parse(x.datetime.replace(' ', 'T') + 'Z'),
    o: +x.open, h: +x.high, l: +x.low, c: +x.close,
  }));
}

fs.mkdirSync(STATE_DIR, { recursive: true });
const firstRun = !fs.existsSync(STATE_FILE);
let seen = [];
if (!firstRun) {
  try { seen = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { seen = []; }
}

let fetched = 0, sent = 0, fetchErrors = 0, pushErrors = 0, expired = false;

for (let i = 0; i < cfg.pairs.length; i++) {
  const pair = cfg.pairs[i];
  let bars;
  try {
    bars = await fetchBars(pair);
    fetched++;
  } catch (e) {
    fetchErrors++;
    console.error(`${pair}: 取得に失敗しました: ${e.message}`);
    if (i < cfg.pairs.length - 1) await sleep(900);
    continue;
  }
  if (i < cfg.pairs.length - 1) await sleep(900);

  const last = bars[bars.length - 1];
  if (Date.now() - last.t > TF_MS[cfg.tf] * 3) {
    console.log(`${pair}: 最新の足が古いため(市場が閉じている可能性)判定しません。`);
    continue;
  }
  if (bars.length < 40) {
    console.log(`${pair}: 足の本数が足りないため判定しません。`);
    continue;
  }

  const res = analyze(bars.map((b) => b.c), acfg);
  const sg = res.signal;
  if (!sg) {
    console.log(`${pair}: シグナルなし`);
    continue;
  }
  const key = `${pair}|${cfg.tf}|${sg.dir}|${bars[sg.idx].t}`;
  if (seen.includes(key)) {
    console.log(`${pair}: 通知済みのシグナルです。`);
    continue;
  }
  seen.push(key);
  if (firstRun) {
    console.log(`${pair}: 初回のため、現在のシグナルは通知せず記録だけしました。`);
    continue;
  }
  const dec = DEC[pair] ?? 3;
  const r = await push({
    title: `${sg.dir > 0 ? '買い' : '売り'}シグナル ${pair}`,
    body: `${TF_LABEL[cfg.tf] || cfg.tf}・強度${sg.strength}(${sg.inds.map((n) => IND_NAME[n]).join('、')}) ${last.c.toFixed(dec)}`,
    tag: `fx-${pair}`,
  });
  if (r.ok) {
    sent++;
    console.log(`${pair}: ${sg.dir > 0 ? '買い' : '売り'}シグナルを通知しました。`);
  } else {
    seen.pop(); // 送れなかったものは次回もう一度試す
    pushErrors++;
    if (r.status === 404 || r.status === 410) expired = true;
    console.error(`${pair}: 通知の送信に失敗しました(status ${r.status ?? '-'}): ${r.msg}`);
  }
}

if (seen.length > 300) seen = seen.slice(-300);
fs.writeFileSync(STATE_FILE, JSON.stringify(seen));
console.log(`完了: 取得${fetched}件、通知${sent}件、取得失敗${fetchErrors}件、送信失敗${pushErrors}件`);

if (expired) fail('プッシュの購読が無効になっています。アプリで「プッシュ通知を準備する」をやり直し、Secretを更新してください。');
if (fetched === 0) fail('すべての通貨ペアでレートを取得できませんでした。APIキーと無料枠の残りを確認してください。');
if (pushErrors > 0) process.exit(1);
