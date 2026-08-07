import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

/**
 * GET /widget.js — the embeddable quote widget.
 *
 * Embed on a client site with:
 *   <script src="https://glassleads.app/widget.js" data-client="SLUG" async></script>
 *   <div data-glassleads-widget></div>   <!-- optional; omit for floating button -->
 *
 * Design goals, in order:
 *  1. Perfect attribution: click IDs and UTMs are captured on ANY page the
 *     visitor lands on and persisted for 90 days, so a lead submitted three
 *     pages (or three days) later still carries the ad click that caused it.
 *  2. Zero-config branding: colors/name/services come from /api/widget/config.
 *  3. Never break the host page: everything renders in shadow DOM, all errors
 *     are swallowed into a friendly call-us fallback.
 *
 * The submit posts the same flat JSON dialect the lead webhook already parses
 * for landing pages, so no server-side lead-path changes are needed. The site
 * origin must be in the client's Allowed Browser Origins (admin → client →
 * Lead Forwarding), otherwise the browser blocks the cross-origin POST.
 */

const WIDGET_SOURCE = String.raw`(function () {
  'use strict';
  if (window.__glassleadsWidget) return;
  window.__glassleadsWidget = true;

  var script = document.currentScript;
  if (!script) return;
  var CLIENT = script.getAttribute('data-client');
  if (!CLIENT) { console.warn('[glassleads] missing data-client attribute'); return; }
  var BASE = new URL(script.src).origin;
  var ATTR_KEY = 'glassleads_attr';
  var ATTR_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid', 'ttclid', 'li_fat_id'];
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  // ---- Attribution capture (runs on every page load, not just form pages) --
  function readStored() {
    try {
      var raw = localStorage.getItem(ATTR_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.ts || Date.now() - data.ts > ATTR_TTL_MS) return null;
      return data;
    } catch (e) { return null; }
  }

  function captureAttribution() {
    var stored = readStored() || {};
    var params = new URLSearchParams(window.location.search);
    var sawClickId = false;
    var sawUtm = false;
    var i, k, v;
    for (i = 0; i < CLICK_IDS.length; i++) {
      k = CLICK_IDS[i]; v = params.get(k);
      if (v) { stored[k] = v; sawClickId = true; }
    }
    for (i = 0; i < UTM_KEYS.length; i++) {
      k = UTM_KEYS[i]; v = params.get(k);
      if (v) { stored[k] = v; sawUtm = true; }
    }
    // A fresh ad click (or tagged visit) starts a new attribution session:
    // stamp the landing page and referrer of THIS visit. Otherwise keep the
    // first-seen values, and only fill them if we have none yet.
    if (sawClickId || sawUtm || !stored.landing_page) {
      stored.landing_page = window.location.href.split('#')[0];
      stored.referrer = document.referrer || stored.referrer || '';
    }
    stored.ts = stored.ts && !sawClickId && !sawUtm ? stored.ts : Date.now();
    try { localStorage.setItem(ATTR_KEY, JSON.stringify(stored)); } catch (e) {}
    return stored;
  }

  var attribution = captureAttribution();

  // ---- Widget UI ----------------------------------------------------------
  var YEARS = (function () {
    var out = [], y = new Date().getFullYear() + 1;
    for (; y >= 1985; y--) out.push(y);
    return out;
  })();
  var MAKES = ['Acura','Audi','BMW','Buick','Cadillac','Chevrolet','Chrysler','Dodge','Ford','GMC','Honda','Hyundai','Infiniti','Jeep','Kia','Lexus','Lincoln','Mazda','Mercedes-Benz','Mitsubishi','Nissan','Ram','Subaru','Tesla','Toyota','Volkswagen','Volvo','Other'];

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function buildStyles(cfg) {
    return '' +
      ':host{all:initial}' +
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
      '.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);overflow:hidden;max-width:420px;width:100%}' +
      '.head{padding:16px 20px;color:#fff;background:' + cfg.primaryColor + '}' +
      '.head h3{margin:0;font-size:17px;font-weight:700}' +
      '.head p{margin:4px 0 0;font-size:13px;opacity:.9}' +
      '.body{padding:16px 20px 20px}' +
      '.row{display:flex;gap:10px}.row>*{flex:1}' +
      'label{display:block;font-size:12px;font-weight:600;color:#374151;margin:10px 0 4px}' +
      'input,select,textarea{width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;background:#fff;color:#111827}' +
      'input:focus,select:focus,textarea:focus{outline:2px solid ' + cfg.secondaryColor + ';outline-offset:0;border-color:transparent}' +
      '.btn{width:100%;margin-top:14px;padding:12px;border:0;border-radius:10px;font-size:15px;font-weight:700;color:#fff;cursor:pointer;background:' + cfg.primaryColor + '}' +
      '.btn:disabled{opacity:.6;cursor:default}' +
      '.fine{font-size:11px;color:#9ca3af;text-align:center;margin-top:8px}' +
      '.ok{padding:28px 20px;text-align:center}' +
      '.ok .big{font-size:34px}' +
      '.ok h4{margin:8px 0 4px;font-size:17px;color:#111827}' +
      '.ok p{margin:0;font-size:14px;color:#6b7280}' +
      '.err{margin-top:10px;padding:9px 10px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:13px}' +
      '.hp{position:absolute;left:-9999px;top:-9999px;height:1px;width:1px;overflow:hidden}' +
      '.fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:13px 18px;border:0;border-radius:999px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);background:' + cfg.primaryColor + '}' +
      '.overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.close{position:absolute;top:10px;right:14px;background:none;border:0;color:#fff;font-size:22px;cursor:pointer;opacity:.85}' +
      '.headwrap{position:relative}';
  }

  function buildForm(cfg, onSubmit) {
    var form = el('form', { novalidate: 'novalidate' });
    function field(labelText, input) {
      var wrap = el('div');
      wrap.appendChild(el('label', { text: labelText }));
      wrap.appendChild(input);
      return wrap;
    }
    var name = el('input', { type: 'text', name: 'full_name', autocomplete: 'name', placeholder: 'Jane Smith' });
    var phone = el('input', { type: 'tel', name: 'phone', autocomplete: 'tel', required: 'required', placeholder: '(555) 555-1234' });
    var email = el('input', { type: 'email', name: 'email', autocomplete: 'email', placeholder: 'jane@email.com' });
    var service = el('select', { name: 'service' });
    service.appendChild(el('option', { value: '', text: 'Select a service…' }));
    (cfg.services || []).forEach(function (s) { service.appendChild(el('option', { value: s, text: s })); });
    service.appendChild(el('option', { value: 'Not sure', text: "Not sure — I just need a quote" }));
    var year = el('select', { name: 'vehicle_year' });
    year.appendChild(el('option', { value: '', text: 'Year' }));
    YEARS.forEach(function (y) { year.appendChild(el('option', { value: String(y), text: String(y) })); });
    var make = el('select', { name: 'vehicle_make' });
    make.appendChild(el('option', { value: '', text: 'Make' }));
    MAKES.forEach(function (m) { make.appendChild(el('option', { value: m, text: m })); });
    var model = el('input', { type: 'text', name: 'vehicle_model', placeholder: 'Model' });
    var zip = el('input', { type: 'text', name: 'postal_code', autocomplete: 'postal-code', inputmode: 'numeric', placeholder: 'ZIP code' });
    var notes = el('textarea', { name: 'message', rows: '2', placeholder: 'Anything else we should know? (optional)' });
    var hp = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    hp.className = 'hp';
    var btn = el('button', { type: 'submit', text: 'Get My Free Quote' });
    btn.className = 'btn';
    var err = el('div'); err.className = 'err'; err.style.display = 'none';

    form.appendChild(field('Name', name));
    var row1 = el('div'); row1.className = 'row';
    row1.appendChild(field('Phone *', phone));
    row1.appendChild(field('Email', email));
    form.appendChild(row1);
    form.appendChild(field('What do you need?', service));
    var row2 = el('div'); row2.className = 'row';
    row2.appendChild(field('Vehicle', year));
    row2.appendChild(field(' ', make));
    row2.appendChild(field(' ', model));
    form.appendChild(row2);
    form.appendChild(field('ZIP code', zip));
    form.appendChild(field('Notes', notes));
    form.appendChild(hp);
    form.appendChild(err);
    form.appendChild(btn);
    form.appendChild(el('div', { text: 'Free quote. No obligation. We never share your info.' })).className = 'fine';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.style.display = 'none';
      if (!phone.value.replace(/\D/g, '') || phone.value.replace(/\D/g, '').length < 7) {
        err.textContent = 'Please enter a phone number so we can send your quote.';
        err.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Sending…';
      var vehicle = [year.value, make.value, model.value].filter(Boolean).join(' ');
      onSubmit({
        full_name: name.value.trim() || null,
        phone: phone.value.trim(),
        email: email.value.trim() || null,
        service: service.value || null,
        vehicle: vehicle || null,
        vehicle_year: year.value || null,
        vehicle_make: make.value || null,
        vehicle_model: model.value.trim() || null,
        postal_code: zip.value.trim() || null,
        message: notes.value.trim() || null,
        website: hp.value || ''
      }, function (ok, friendly) {
        if (ok) return;
        btn.disabled = false;
        btn.textContent = 'Get My Free Quote';
        err.textContent = friendly;
        err.style.display = 'block';
      });
    });
    return form;
  }

  function buildCard(cfg, onDone) {
    var card = el('div'); card.className = 'card';
    var headwrap = el('div'); headwrap.className = 'headwrap';
    var head = el('div'); head.className = 'head';
    head.appendChild(el('h3', { text: 'Get a Free Auto Glass Quote' }));
    head.appendChild(el('p', { text: cfg.businessName + (cfg.offersMobileService ? ' — mobile service available' : '') }));
    headwrap.appendChild(head);
    card.appendChild(headwrap);
    var body = el('div'); body.className = 'body';

    var form = buildForm(cfg, function (data, fail) {
      var stored = readStored() || attribution || {};
      var payload = {
        first_name: (data.full_name || '').split(' ')[0] || null,
        last_name: (data.full_name || '').split(' ').slice(1).join(' ') || null,
        full_name: data.full_name,
        phone: data.phone,
        email: data.email,
        service: data.service,
        vehicle: data.vehicle,
        vehicle_year: data.vehicle_year,
        vehicle_make: data.vehicle_make,
        vehicle_model: data.vehicle_model,
        postal_code: data.postal_code,
        message: data.message,
        form_name: 'glassleads-widget',
        landing_page: stored.landing_page || window.location.href.split('#')[0],
        referrer: stored.referrer || document.referrer || null,
        page: window.location.href.split('#')[0],
        _hp: data.website
      };
      CLICK_IDS.concat(UTM_KEYS).forEach(function (k) { if (stored[k]) payload[k] = stored[k]; });

      fetch(BASE + '/api/webhooks/highlevel/lead?client=' + encodeURIComponent(CLIENT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        body.innerHTML = '';
        var ok = el('div'); ok.className = 'ok';
        ok.appendChild(el('div', { text: '✅' })).className = 'big';
        ok.appendChild(el('h4', { text: 'Got it — quote on the way!' }));
        ok.appendChild(el('p', { text: cfg.businessName + ' will call or text you shortly.' }));
        body.appendChild(ok);
        if (onDone) onDone();
      }).catch(function () {
        fail(false, 'Something went wrong sending your request. Please call us at ' + (cfg.phone || 'the number on this page') + '.');
      });
    });

    body.appendChild(form);
    card.appendChild(body);
    return { card: card, headwrap: headwrap };
  }

  function mountInline(container, cfg) {
    var host = el('div');
    container.appendChild(host);
    var shadow = host.attachShadow({ mode: 'open' });
    var style = el('style', { text: buildStyles(cfg) });
    shadow.appendChild(style);
    shadow.appendChild(buildCard(cfg, null).card);
  }

  function mountFloating(cfg) {
    var host = el('div');
    document.body.appendChild(host);
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(el('style', { text: buildStyles(cfg) }));
    var fab = el('button', { type: 'button', text: '💬 Free Quote' });
    fab.className = 'fab';
    shadow.appendChild(fab);
    var overlay = null;
    fab.addEventListener('click', function () {
      if (overlay) { overlay.style.display = 'flex'; return; }
      overlay = el('div'); overlay.className = 'overlay';
      var built = buildCard(cfg, function () {
        setTimeout(function () { overlay.style.display = 'none'; }, 2500);
      });
      var close = el('button', { type: 'button', text: '×' });
      close.className = 'close';
      close.addEventListener('click', function () { overlay.style.display = 'none'; });
      built.headwrap.appendChild(close);
      overlay.appendChild(built.card);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });
      shadow.appendChild(overlay);
    });
  }

  function init() {
    fetch(BASE + '/api/widget/config?client=' + encodeURIComponent(CLIENT))
      .then(function (res) { if (!res.ok) throw new Error('config ' + res.status); return res.json(); })
      .then(function (cfg) {
        var containers = document.querySelectorAll('[data-glassleads-widget]');
        if (containers.length > 0) {
          for (var i = 0; i < containers.length; i++) mountInline(containers[i], cfg);
        } else {
          mountFloating(cfg);
        }
      })
      .catch(function (err) { console.warn('[glassleads] widget failed to load:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`

export async function GET() {
  return new NextResponse(WIDGET_SOURCE, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Short browser cache, longer CDN cache: widget updates roll out within
      // minutes without clients ever touching their embed code.
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
