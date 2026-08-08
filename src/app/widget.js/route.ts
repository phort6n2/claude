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

  function rgba(hex, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 'rgba(0,0,0,' + a + ')';
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
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
      '.head p{margin:4px 0 0;font-size:14px;color:#5c5c5c;line-height:1.5}' +
      '.body{padding:14px 22px 22px}' +
      // Rows stack on narrow embeds and go two-up when the card is wide
      // enough, like the template's 600px qc-row-2 breakpoint.
      '.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}' +
      '.row+.row,.row+div,div+.row{margin-top:14px}' +
      '.field{min-width:0}' +
      'label{display:block;font-size:14px;font-weight:600;color:#1a1a1a;margin:0 0 6px}' +
      '.req{color:' + cfg.primaryColor + ';margin-left:2px}' +
      '.opt{color:#6e6e6e;font-weight:400}' +
      'input,select,textarea{width:100%;min-height:50px;padding:13px 14px;border:1.5px solid #7C8FA3;border-radius:14px;font-size:16.5px;line-height:1.3;background:#fff;color:#1a1a1a;appearance:none;-webkit-appearance:none;transition:border-color .12s ease,box-shadow .12s ease}' +
      'input::placeholder,textarea::placeholder{color:#5E6D7C;opacity:1}' +
      'input:hover,select:hover,textarea:hover{border-color:#66788B}' +
      'textarea{min-height:96px;resize:vertical;line-height:1.5;padding-top:11px}' +
      'select{padding-right:42px;background-repeat:no-repeat;background-position:right 14px center;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%234C5C6B\' stroke-width=\'2.2\' stroke-linecap=\'round\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")}' +
      'input:focus,select:focus,textarea:focus{outline:none;border-color:' + cfg.primaryColor + ';box-shadow:0 0 0 3px ' + rgba(cfg.primaryColor, 0.16) + '}' +
      'input[aria-invalid="true"],select[aria-invalid="true"]{border-color:#B3261E;background:#FEF2F2;box-shadow:0 0 0 3px rgba(179,38,30,.14)}' +
      '.ferr{display:none;margin:6px 0 0;font-size:13.5px;font-weight:600;color:#B3261E}' +
      '.ferr.on{display:block}' +
      '.vin-input{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.04em}' +
      '.hint{display:none;margin:6px 0 0;font-size:13px;color:#5c5c5c}' +
      '.hint.on{display:block}' +
      // Progressive-disclosure drawer, per the template: VIN, insurance, and
      // notes stay optional and out of the visible form.
      '.more-btn{width:100%;min-height:52px;margin-top:16px;padding:10px 14px;display:flex;align-items:center;gap:12px;text-align:left;background:#faf7f7;border:1px solid #e2d8d8;border-radius:10px;cursor:pointer;color:#1a1a1a}' +
      '.more-btn:hover,.more-btn[aria-expanded="true"]{background:' + rgba(cfg.primaryColor, 0.07) + '}' +
      '.more-btn[aria-expanded="true"]{border-bottom-left-radius:0;border-bottom-right-radius:0}' +
      '.more-t{font-size:15px;font-weight:600}' +
      '.more-s{font-size:13px;color:#6e6e6e}' +
      '.chev{margin-left:auto;flex:0 0 auto;color:#6e6e6e;transition:transform .18s ease}' +
      '.more-btn[aria-expanded="true"] .chev{transform:rotate(180deg)}' +
      '.drawer{display:grid;gap:14px;padding:18px 14px;background:#faf7f7;border:1px solid #e2d8d8;border-top:0;border-radius:0 0 10px 10px}' +
      '.drawer[hidden]{display:none}' +
      '.radios{display:flex;flex-wrap:wrap;gap:8px;border:0;margin:0;padding:0}' +
      '.radios legend{flex:1 1 100%;font-size:14px;font-weight:600;color:#1a1a1a;padding:0;margin:0 0 8px}' +
      '.radio{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;background:#fff;border:1.5px solid #7C8FA3;border-radius:14px;cursor:pointer;font-size:15px;color:#1a1a1a}' +
      '.radio input{width:18px;height:18px;min-height:0;accent-color:' + cfg.primaryColor + ';margin:0;appearance:auto;-webkit-appearance:auto}' +
      '.radio:has(input:checked){border-color:' + cfg.primaryColor + ';background:' + rgba(cfg.primaryColor, 0.08) + ';font-weight:600}' +
      '.btn{width:100%;min-height:56px;margin-top:18px;padding:14px;border:0;border-radius:14px;font-size:17.5px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(180deg,' + cfg.primaryColor + ',' + darken(cfg.primaryColor, 0.17) + ');box-shadow:0 6px 14px -4px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.2)}' +
      '.btn:disabled{opacity:.6;cursor:default}' +
      '.micro{font-size:13px;color:#5c5c5c;text-align:center;margin-top:12px;line-height:1.5}' +
      '.consent{font-size:12px;color:#8a8a8a;margin-top:12px;line-height:1.5}' +
      '.ok{padding:28px 22px;text-align:center}' +
      '.ok .big{width:56px;height:56px;margin:0 auto;border-radius:999px;display:flex;align-items:center;justify-content:center;color:' + cfg.primaryColor + ';background:' + rgba(cfg.primaryColor, 0.1) + '}' +
      '.ok h4{margin:14px 0 8px;font-size:18px;color:#1a1a1a}' +
      '.ok p{margin:0;font-size:16px;color:#5c5c5c}' +
      '.ok a{display:block;margin-top:16px;padding:14px;min-height:52px;border-radius:14px;font-weight:700;font-size:16px;color:#fff;text-decoration:none;background:linear-gradient(180deg,' + cfg.primaryColor + ',' + darken(cfg.primaryColor, 0.17) + ');box-shadow:0 6px 14px -4px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.2)}' +
      '.err{display:none;margin-top:12px;padding:12px 14px;border-radius:10px;background:#FEF2F2;border:1px solid #E3A9A5;color:#B3261E;font-size:14px}' +
      '.err.on{display:block}' +
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
    var fieldErrs = {};
    function field(labelHtml, input, errKey) {
      var wrap = el('div', { class: 'field' });
      wrap.appendChild(el('label', { html: labelHtml }));
      wrap.appendChild(input);
      if (errKey) {
        var p = el('p', { class: 'ferr' });
        fieldErrs[errKey] = { p: p, input: input };
        wrap.appendChild(p);
      }
      return wrap;
    }
    function setFieldError(key, message) {
      var f = fieldErrs[key];
      if (!f) return;
      if (message) {
        f.p.textContent = message;
        f.p.className = 'ferr on';
        f.input.setAttribute('aria-invalid', 'true');
      } else {
        f.p.className = 'ferr';
        f.input.removeAttribute('aria-invalid');
      }
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
    var vin = el('input', { type: 'text', name: 'vin', class: 'vin-input', maxlength: '17', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'JTMRFREV7HD000000' });
    var vinHint = el('p', { class: 'hint' });
    vin.addEventListener('input', function () {
      var v = vin.value.trim().toUpperCase();
      if (!v) { vinHint.className = 'hint'; return; }
      vinHint.className = 'hint on';
      vinHint.textContent = /^[A-HJ-NPR-Z0-9]{17}$/.test(v)
        ? '✓ Looks like a valid VIN'
        : v.length + ' of 17 characters';
    });
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
    var err = el('div'); err.className = 'err';

    var row1 = el('div', { class: 'row' }, [field('Full name' + REQ, name, 'name'), field('Mobile phone' + REQ, phone, 'phone')]);
    var row2 = el('div', { class: 'row' }, [field('Email' + REQ, email, 'email'), field('Service ZIP' + REQ, zip, 'zip')]);
    var row3 = el('div', { class: 'row' }, [field('What do you need?' + REQ, service), field('Vehicle' + REQ, vehicle, 'vehicle')]);
    form.appendChild(row1);
    form.appendChild(row2);
    form.appendChild(row3);

    var vinField = field('VIN <span class="opt">— optional, gets us the exact glass</span>', vin);
    vinField.appendChild(vinHint);
    var drawer = el('div', { class: 'drawer' });
    drawer.hidden = true;
    drawer.appendChild(vinField);
    drawer.appendChild(radios);
    drawer.appendChild(carrierField);
    drawer.appendChild(field('Anything else? <span class="opt">— optional</span>', notes));

    var moreBtn = el('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false' });
    moreBtn.appendChild(el('span', {
      html: '<span class="more-t">Speed up my quote <span class="opt">(optional)</span></span><br>' +
        '<span class="more-s">VIN, insurance, and anything else about the damage</span>'
    }));
    moreBtn.appendChild(el('span', {
      class: 'chev',
      'aria-hidden': 'true',
      html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>'
    }));
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
      err.className = 'err';
      // Required per the template: everything in the visible form, with a
      // message under each failed field plus a summary box before submit.
      var firstBad = null;
      function check(key, input, bad, message) {
        setFieldError(key, bad ? message : null);
        if (bad && !firstBad) firstBad = input;
      }
      check('name', name, !name.value.trim(), 'Please enter your name.');
      check('phone', phone, phone.value.replace(/\D/g, '').length < 7, 'Please enter a mobile number we can reach you on.');
      check('email', email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()), 'Please enter a valid email.');
      check('zip', zip, !/^\d{5}$/.test(zip.value.trim()), 'Please enter your 5-digit ZIP.');
      check('vehicle', vehicle, !vehicle.value.trim(), 'Tell us the year, make and model.');
      if (firstBad) {
        err.textContent = 'A couple of fields need attention — see the notes above.';
        err.className = 'err on';
        firstBad.focus();
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
        err.className = 'err on';
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
        ok.appendChild(el('div', {
          class: 'big',
          html: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
        }));
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
