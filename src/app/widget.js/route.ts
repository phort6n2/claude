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
 * The form itself follows the landing-template quote-card spec (.qc): name /
 * phone / email / ZIP / service / vehicle all visible and required, optional
 * details (VIN, insurance, notes) behind a "Speed up my quote" drawer, and a
 * display:none honeypot with a name no autofill heuristic recognises — the
 * template's hard-won lesson is that an off-screen honeypot gets filled by
 * Chrome's profile autofill and silently eats real leads.
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
  var CARRIERS = ['State Farm', 'GEICO', 'Progressive', 'AAA', 'USAA', 'Farmers', 'Allstate', 'Mercury', 'Other'];

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

  function darken(hex, f) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    function c(v) { return ('0' + Math.round(v * (1 - f)).toString(16)).slice(-2); }
    return '#' + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255);
  }

  function buildStyles(cfg) {
    return '' +
      ':host{all:initial}' +
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
      // Card mirrors the landing-template quote card (.qc): white, brand top
      // border, no dark header band.
      '.card{background:#fff;border:1px solid #e2d8d8;border-top:4px solid ' + cfg.primaryColor + ';border-radius:20px;box-shadow:0 2px 4px rgba(20,20,20,.04),0 10px 20px -6px rgba(20,20,20,.08),0 28px 56px -18px rgba(20,20,20,.15);overflow:hidden;max-width:430px;width:100%}' +
      '.head{padding:20px 22px 0;color:#1a1a1a}' +
      '.head h3{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em}' +
      '.head p{margin:4px 0 0;font-size:13px;color:#5c5c5c}' +
      '.body{padding:14px 22px 22px}' +
      '.row{display:flex;gap:10px}.row>*{flex:1;min-width:0}' +
      '.row+.row,.row+div,div+.row{margin-top:2px}' +
      'label{display:block;font-size:13px;font-weight:600;color:#1a1a1a;margin:12px 0 5px}' +
      '.req{color:' + cfg.primaryColor + ';margin-left:2px}' +
      '.opt{color:#6e6e6e;font-weight:400}' +
      'input,select,textarea{width:100%;min-height:44px;padding:10px 12px;border:1.5px solid #8a8a8a;border-radius:12px;font-size:16px;background:#fff;color:#1a1a1a}' +
      'textarea{min-height:72px}' +
      'input:focus,select:focus,textarea:focus{outline:none;border-color:' + cfg.primaryColor + ';box-shadow:0 0 0 3px rgba(0,0,0,.08)}' +
      'input.bad,select.bad{border-color:#b3261e;background:#fef2f2}' +
      // Progressive-disclosure drawer, per the template: VIN, insurance, and
      // notes stay optional and out of the visible form.
      '.more-btn{width:100%;margin-top:16px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;background:#faf7f7;border:1px solid #e2d8d8;border-radius:12px;cursor:pointer;color:#1a1a1a}' +
      '.more-t{font-size:14px;font-weight:700}' +
      '.more-s{font-size:12px;color:#6e6e6e}' +
      '.chev{transition:transform .15s ease;flex:0 0 auto}' +
      '.more-btn[aria-expanded="true"] .chev{transform:rotate(180deg)}' +
      '.radios{border:0;margin:12px 0 0;padding:0}' +
      '.radios legend{font-size:13px;font-weight:600;color:#1a1a1a;padding:0;margin:0 0 6px}' +
      '.radio{display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:14px;color:#1a1a1a}' +
      '.radio input{width:auto;min-height:0}' +
      '.btn{width:100%;margin-top:16px;padding:14px;border:0;border-radius:14px;font-size:16px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(180deg,' + cfg.primaryColor + ',' + darken(cfg.primaryColor, 0.17) + ');box-shadow:0 6px 14px -4px rgba(0,0,0,.3)}' +
      '.btn:disabled{opacity:.6;cursor:default}' +
      '.micro{font-size:12px;color:#5c5c5c;text-align:center;margin-top:10px}' +
      '.consent{font-size:11px;color:#8a8a8a;text-align:center;margin-top:6px;line-height:1.4}' +
      '.ok{padding:28px 22px;text-align:center}' +
      '.ok .big{width:52px;height:52px;margin:0 auto;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:26px;color:#fff;background:' + cfg.primaryColor + '}' +
      '.ok h4{margin:12px 0 4px;font-size:18px;color:#1a1a1a}' +
      '.ok p{margin:0;font-size:14px;color:#5c5c5c}' +
      '.ok a{display:block;margin-top:14px;padding:13px;border-radius:12px;font-weight:700;color:#fff;text-decoration:none;background:' + cfg.primaryColor + '}' +
      '.err{margin-top:10px;padding:9px 10px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:13px}' +
      // display:none, not off-screen: Chrome profile autofill fills off-screen
      // fields but skips display:none — see the template's honeypot post-mortem.
      '.hp{display:none}' +
      '.fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:13px 18px;border:0;border-radius:999px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);background:' + cfg.primaryColor + '}' +
      '.overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}' +
      '.close{position:absolute;top:10px;right:14px;background:none;border:0;color:#1a1a1a;font-size:22px;cursor:pointer;opacity:.7}' +
      '.headwrap{position:relative}';
  }

  function buildForm(cfg, onSubmit) {
    var form = el('form', { novalidate: 'novalidate' });
    function field(labelHtml, input) {
      var wrap = el('div');
      wrap.appendChild(el('label', { html: labelHtml }));
      wrap.appendChild(input);
      return wrap;
    }
    var REQ = '<span class="req" aria-hidden="true">*</span>';

    var name = el('input', { type: 'text', name: 'full_name', autocomplete: 'name', placeholder: 'Alex Ramirez' });
    var phone = el('input', { type: 'tel', name: 'phone', inputmode: 'tel', autocomplete: 'tel', placeholder: '(714) 555-0142' });
    var email = el('input', { type: 'email', name: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    var zip = el('input', { type: 'text', name: 'postal_code', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: '5', placeholder: '92614' });
    var service = el('select', { name: 'service' });
    // Template spec: no placeholder option — the most common job is the default.
    (cfg.services || []).forEach(function (s) { service.appendChild(el('option', { value: s, text: s })); });
    service.appendChild(el('option', { value: 'Not sure', text: 'Not sure — help me work it out' }));
    var vehicle = el('input', { type: 'text', name: 'vehicle', autocomplete: 'off', placeholder: '2021 Toyota RAV4' });

    // Optional drawer: VIN, insurance, notes.
    var vin = el('input', { type: 'text', name: 'vin', maxlength: '17', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'JTMRFREV7HD000000' });
    var notes = el('textarea', { name: 'message', rows: '3', maxlength: '1000', placeholder: 'How it happened, where the damage is, anything unusual about the vehicle' });
    var carrier = el('select', { name: 'carrier' });
    carrier.appendChild(el('option', { value: '', text: 'Select your carrier' }));
    CARRIERS.forEach(function (c) { carrier.appendChild(el('option', { value: c, text: c })); });
    var carrierField = field('Your carrier', carrier);
    carrierField.style.display = 'none';

    var radios = el('fieldset', { class: 'radios' });
    radios.appendChild(el('legend', { text: 'Filing through insurance?' }));
    var insValue = 'not-sure';
    [['yes', 'Yes'], ['no', 'Self-pay'], ['not-sure', 'Not sure yet']].forEach(function (pair) {
      var input = el('input', { type: 'radio', name: 'insurance', value: pair[0] });
      if (pair[0] === 'not-sure') input.checked = true;
      input.addEventListener('change', function () {
        insValue = pair[0];
        carrierField.style.display = pair[0] === 'yes' ? '' : 'none';
      });
      radios.appendChild(el('label', { class: 'radio' }, [input, document.createTextNode(' ' + pair[1])]));
    });

    // Honeypot: no label, display:none, a name autofill doesn't recognise.
    var hp = el('input', { type: 'text', name: 'hp_check', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var hpWrap = el('div', { class: 'hp', 'aria-hidden': 'true' }, [hp]);

    var btn = el('button', { type: 'submit', text: 'Get my free quote' });
    btn.className = 'btn';
    var err = el('div'); err.className = 'err'; err.style.display = 'none';

    var row1 = el('div', { class: 'row' }, [field('Full name' + REQ, name), field('Mobile phone' + REQ, phone)]);
    var row2 = el('div', { class: 'row' }, [field('Email' + REQ, email), field('Service ZIP' + REQ, zip)]);
    var row3 = el('div', { class: 'row' }, [field('What do you need?' + REQ, service), field('Vehicle' + REQ, vehicle)]);
    form.appendChild(row1);
    form.appendChild(row2);
    form.appendChild(row3);

    var drawer = el('div');
    drawer.hidden = true;
    drawer.appendChild(field('VIN <span class="opt">— optional, gets us the exact glass</span>', vin));
    drawer.appendChild(radios);
    drawer.appendChild(carrierField);
    drawer.appendChild(field('Anything else? <span class="opt">— optional</span>', notes));

    var moreBtn = el('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false' });
    moreBtn.appendChild(el('span', {
      html: '<span class="more-t">Speed up my quote <span class="opt">(optional)</span></span><br>' +
        '<span class="more-s">VIN, insurance, and anything else about the damage</span>'
    }));
    moreBtn.appendChild(el('span', { class: 'chev', 'aria-hidden': 'true', text: '⌄' }));
    moreBtn.addEventListener('click', function () {
      var open = drawer.hidden;
      drawer.hidden = !open;
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    form.appendChild(moreBtn);
    form.appendChild(drawer);
    form.appendChild(hpWrap);
    form.appendChild(err);
    form.appendChild(btn);
    form.appendChild(el('p', { class: 'micro', text: 'No obligation · We confirm your coverage before dispatch' }));
    form.appendChild(el('p', { class: 'consent', text: 'By submitting this form you agree we may contact you by phone, text or email about your quote. Message rates may apply.' }));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.style.display = 'none';
      // Required per the template: everything in the visible form.
      var missing = [];
      function check(input, bad) {
        input.classList.toggle('bad', bad);
        if (bad) missing.push(input);
      }
      check(name, !name.value.trim());
      check(phone, phone.value.replace(/\D/g, '').length < 7);
      check(email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
      check(zip, !/^\d{5}$/.test(zip.value.trim()));
      check(vehicle, !vehicle.value.trim());
      if (missing.length) {
        err.textContent = 'Please fill in the highlighted fields.';
        err.style.display = 'block';
        missing[0].focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Sending…';
      onSubmit({
        full_name: name.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim(),
        service: service.value || null,
        vehicle: vehicle.value.trim(),
        postal_code: zip.value.trim(),
        vin: vin.value.trim() || null,
        insurance: insValue,
        insurance_carrier: insValue === 'yes' ? carrier.value || null : null,
        message: notes.value.trim() || null,
        hp: hp.value || ''
      }, function (ok, friendly) {
        if (ok) return;
        btn.disabled = false;
        btn.textContent = 'Get my free quote';
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
    head.appendChild(el('h3', { text: 'Get your free quote' }));
    head.appendChild(el('p', { text: "Takes about 30 seconds. We'll confirm your glass and your coverage before anyone is dispatched." }));
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
        postal_code: data.postal_code,
        vin: data.vin,
        insurance: data.insurance,
        insurance_carrier: data.insurance_carrier,
        message: data.message,
        form_name: 'glassleads-widget',
        landing_page: stored.landing_page || window.location.href.split('#')[0],
        referrer: stored.referrer || document.referrer || null,
        page: window.location.href.split('#')[0],
        _hp: data.hp
      };
      CLICK_IDS.concat(UTM_KEYS).forEach(function (k) { if (stored[k]) payload[k] = stored[k]; });

      fetch(BASE + '/api/webhooks/highlevel/lead?client=' + encodeURIComponent(CLIENT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        body.innerHTML = '';
        var first = (data.full_name || '').split(' ')[0] || 'there';
        var ok = el('div'); ok.className = 'ok';
        ok.appendChild(el('div', { class: 'big', text: '✓' }));
        ok.appendChild(el('h4', { text: "You're all set, " + first + '.' }));
        ok.appendChild(el('p', { text: "We've got your request. A " + cfg.businessName + ' tech will call you shortly to confirm the glass, your coverage and a time that works.' }));
        if (cfg.phone) {
          ok.appendChild(el('a', { href: 'tel:' + cfg.phone.replace(/[^+\d]/g, ''), text: 'Call us now — ' + cfg.phone }));
        }
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
