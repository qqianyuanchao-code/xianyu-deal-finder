// ==UserScript==
// @name         闲鱼搜索提醒（本地版）
// @namespace    xianyu-deal-finder
// @version      0.1.0
// @description  在打开的闲鱼搜索页定期检查新出现的商品
// @match        https://www.goofish.com/search*
// @match        https://goofish.com/search*
// @grant        none
// @run-at       document-end
// ==/UserScript==
(() => {
  'use strict';
  const prefix = 'xy-watch-v1:';
  const query = new URL(location.href).searchParams.get('q')?.trim();
  if (!query) return;
  const key = prefix + encodeURIComponent(query);
  function read() { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function save(v) { localStorage.setItem(key, JSON.stringify(v)); }
  let cfg = { enabled: false, maxPrice: '', minutes: 5, seen: {}, initialized: false, ...read() };
  let timer, scanTimer, scanned = false;
  const panel = document.createElement('section');
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fff;color:#222;border:2px solid #edc32b;border-radius:12px;padding:14px;width:290px;box-shadow:0 4px 20px #0004;font:14px/1.5 sans-serif';
  panel.innerHTML = '<strong>闲鱼搜索提醒</strong><div id="xy-keyword"></div><label>最高价格（元，可留空）<input id="xy-max" type="number" min="0" step="0.01" style="width:100%;box-sizing:border-box"></label><label>检查间隔（分钟，最少 5）<input id="xy-min" type="number" min="5" max="1440" style="width:100%;box-sizing:border-box"></label><div style="margin-top:8px"><button id="xy-start">开启提醒</button> <button id="xy-stop">停止</button> <button id="xy-scan">立即检查</button></div><div id="xy-status" role="status" style="margin-top:8px"></div><div style="font-size:12px;color:#666">需保持本页和浏览器打开；首次检查只建立基线。价格无法识别的商品不会按限价提醒。</div>';
  document.body.append(panel);
  const el = id => panel.querySelector('#xy-' + id);
  el('keyword').textContent = '关键词：' + query;
  el('max').value = cfg.maxPrice;
  el('min').value = cfg.minutes;
  const status = text => { el('status').textContent = text; };
  function items() {
    const result = new Map();
    for (const a of document.querySelectorAll('a[href*="/item"]')) {
      let u;
      try { u = new URL(a.href, location.href); } catch { continue; }
      if (!['www.goofish.com','goofish.com'].includes(u.hostname)) continue;
      const id = u.searchParams.get('id');
      if (!id || !/^\d+$/.test(id)) continue;
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const priceMatch = text.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/);
      const price = priceMatch ? Number(priceMatch[1]) : null;
      result.set(id, { id, title: text.slice(0, 100), price, url: 'https://www.goofish.com/item?id=' + encodeURIComponent(id) });
    }
    return [...result.values()];
  }
  function notify(item) {
    if (Notification.permission !== 'granted') return;
    const n = new Notification('闲鱼发现新商品：' + query, { body: item.title });
    n.onclick = () => { window.open(item.url, '_blank', 'noopener'); n.close(); };
  }
  function scan() {
    if (!cfg.enabled || scanned) return;
    scanned = true;
    const list = items();
    if (!list.length) {
      cfg.enabled = false; save(cfg);
      status('未识别到商品，已停止。请检查是否需要登录、验证码，或页面结构已变化。');
      return;
    }
    const first = !cfg.initialized;
    const unseen = list.filter(item => !cfg.seen[item.id]);
    for (const item of list) cfg.seen[item.id] = Date.now();
    cfg.seen = Object.fromEntries(Object.entries(cfg.seen).sort((a,b) => b[1] - a[1]).slice(0, 3000));
    cfg.initialized = true; save(cfg);
    const max = cfg.maxPrice === '' ? null : Number(cfg.maxPrice);
    const matches = first ? [] : unseen.filter(item => max === null || (item.price !== null && item.price <= max));
    matches.slice(0, 10).forEach(notify);
    status('检查完成：识别 ' + list.length + ' 件，' + (first ? '已建立基线' : '新增 ' + unseen.length + ' 件，符合条件 ' + matches.length + ' 件') + '。' + (Notification.permission === 'granted' ? '' : '通知未授权。'));
    timer = setTimeout(() => location.reload(), cfg.minutes * 60000);
  }
  function scheduleScan() {
    clearTimeout(scanTimer); clearTimeout(timer); scanned = false;
    status('正在等待搜索结果加载…');
    scanTimer = setTimeout(scan, 15000);
  }
  el('start').onclick = async () => {
    const raw = el('max').value.trim(), minutes = Number(el('min').value);
    if ((raw !== '' && (!Number.isFinite(Number(raw)) || Number(raw) <= 0)) || !Number.isFinite(minutes) || minutes < 5 || minutes > 1440) { status('请输入有效价格和 5–1440 分钟间隔。'); return; }
    if (!('Notification' in window)) { status('浏览器不支持通知。'); return; }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { status('请允许浏览器通知后重试。'); return; }
    cfg = { ...cfg, maxPrice: raw, minutes, enabled: true }; save(cfg); scheduleScan();
  };
  el('stop').onclick = () => { cfg.enabled = false; save(cfg); clearTimeout(timer); clearTimeout(scanTimer); status('已停止。'); };
  el('scan').onclick = () => { if (!cfg.enabled) { status('请先开启提醒。'); return; } scheduleScan(); };
  if (cfg.enabled) scheduleScan(); else status('未开启。');
})();
