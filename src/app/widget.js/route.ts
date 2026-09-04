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

  // ---- Readable companions to the raw values -------------------------------
  // Ported from the landing-template's form so a shop running both a template
  // site and this widget can use ONE HighLevel mapping. The raw keys keep
  // their exact values; these are strictly additive, and exist so the CRM's
  // email template needs no conditionals to render English.

  var INSURANCE_LABEL = {
    'yes': 'Filing through insurance',
    'no': 'Paying out of pocket',
    'not-sure': 'Not sure yet about insurance'
  };

  function phDigits(v) { return (v || '').replace(/\D/g, ''); }

  /* E.164 for the machine. The playbook is explicit that this matches far more
     reliably than a formatted string, for both the CRM and enhanced
     conversions. A number we can't confidently qualify is passed through as
     typed rather than given a country code we're guessing at. */
  function phE164(v) {
    var d = phDigits(v);
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
    return (v || '').trim();
  }

  /* (xxx) xxx-xxxx for the human reading the CRM record. */
  function phPretty(v) {
    var d = phDigits(v);
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    if (d.length !== 10) return (v || '').trim();
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

  /* Fold a service name into mid-sentence case.
     Our service names are Title Case ("Windshield Replacement"), not the
     template's sentence case, so lowering only the first character leaves
     "windshield Replacement". Every word is lowered EXCEPT initialisms —
     "ADAS Calibration" has to stay "ADAS calibration", never "adas". */
  function lowerLabel(s) {
    if (!s) return '';
    return s
      .split(' ')
      .map(function (word) {
        var isInitialism = word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word);
        return isInitialism ? word : word.toLowerCase();
      })
      .join(' ');
  }

  /* "Not sure" is a conversation, not a service: pasting it in produces
     "needs not sure — help me work it out". That one gets its own phrase. */
  function servicePhrase(label) {
    if (!label || /^not sure/i.test(label)) return 'needs help working out which glass';
    return 'needs ' + lowerLabel(label);
  }

  /* One English sentence, assembled from whatever is present. Every optional
     clause drops out cleanly, so a submission carrying only the required
     fields still reads as a sentence rather than trailing a dangling "VIN:". */
  function leadSummary(d) {
    return [
      d.name,
      servicePhrase(d.serviceLabel),
      d.vehicle ? 'on a ' + d.vehicle : '',
      d.vin ? '(VIN ' + d.vin + ')' : '',
      d.carrier ? '— insured with ' + d.carrier : ''
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + '.';
  }

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

  // White button text needs a dark enough fill — darken light brand colors,
  // same rule the host site's palette applies.
  function ensureDark(hex) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
    return l > 0.45 ? darken(hex, 0.35) : hex;
  }

  function buildStyles(cfg) {
    // The button colour the SITE decided, sent with the config. A widget that
    // derived it from primaryColor gave a black-and-yellow shop a black submit
    // under a yellow page — same input, two answers. Falls back to the old
    // derivation for an embed served a config from before this existed.
    var btnBg = cfg.ctaColor || ensureDark(cfg.primaryColor);
    var btnText = cfg.ctaTextColor || '#fff';
    // The required-field asterisk is small text on white, so it takes the
    // brand only when the brand can be read there. The focus ring below keeps
    // primaryColor deliberately: a pale accent is a weak focus indicator, and
    // that one is an accessibility control rather than a brand surface.
    var reqMark = ensureDark(cfg.primaryColor);
    return '' +
      ':host{all:initial}' +
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
      // Card mirrors the landing-template quote card (.qc): white, brand top
      // border, no dark header band.
      '.card{background:#fff;border:1px solid #e2d8d8;border-top:4px solid ' + btnBg + ';border-radius:20px;box-shadow:0 2px 4px rgba(20,20,20,.04),0 10px 20px -6px rgba(20,20,20,.08),0 28px 56px -18px rgba(20,20,20,.15);overflow:hidden;max-width:430px;width:100%}' +
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
      '.req{color:' + reqMark + ';margin-left:2px}' +
      '.opt{color:#6e6e6e;font-weight:400}' +
      'input,select,textarea{width:100%;min-height:50px;padding:13px 14px;border:1.5px solid #7C8FA3;border-radius:14px;font-size:16.5px;line-height:1.3;background:#fff;color:#1a1a1a;appearance:none;-webkit-appearance:none;transition:border-color .12s ease,box-shadow .12s ease}' +
      'input::placeholder,textarea::placeholder{color:#5E6D7C;opacity:1}' +
      'input:hover,select:hover,textarea:hover{border-color:#66788B}' +
      'textarea{min-height:96px;resize:vertical;line-height:1.5;padding-top:11px}' +
      'select{padding-right:42px;background-repeat:no-repeat;background-position:right 14px center;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%234C5C6B\' stroke-width=\'2.2\' stroke-linecap=\'round\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")}' +
      'input:focus,select:focus,textarea:focus{outline:none;border-color:' + cfg.primaryColor + ';box-shadow:0 0 0 3px ' + rgba(cfg.primaryColor, 0.4) + '}' +
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
      // Photo picker: a drop-zone-shaped button rather than a bare file input,
      // which on mobile is an unlabelled grey rectangle nobody presses.
      '.photo-btn{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:12px 14px;background:#fff;border:1.5px dashed #7C8FA3;border-radius:14px;cursor:pointer;font-size:15px;color:#1a1a1a;text-align:left}' +
      '.photo-btn:hover{border-color:' + cfg.primaryColor + ';background:' + rgba(cfg.primaryColor, 0.04) + '}' +
      '.photo-in{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}' +
      '.photo-prev{display:flex;align-items:center;gap:12px;padding:10px;background:#fff;border:1.5px solid #7C8FA3;border-radius:14px}' +
      // display:flex beats the hidden attribute, so the empty preview shows as
      // a bare white bar under the button until this says otherwise.
      '.photo-prev[hidden]{display:none}' +
      '.photo-btn[hidden]{display:none}' +
      '.photo-prev img{width:56px;height:56px;object-fit:cover;border-radius:10px;flex:0 0 auto}' +
      '.photo-meta{min-width:0;flex:1 1 auto;font-size:14px;color:#1a1a1a}' +
      '.photo-meta small{display:block;color:#5c5c5c;font-size:12.5px}' +
      '.photo-x{flex:0 0 auto;min-height:40px;padding:0 12px;background:#fff;border:1.5px solid #7C8FA3;border-radius:10px;cursor:pointer;font-size:14px;color:#1a1a1a}' +
      '.drawer[hidden]{display:none}' +
      '.radios{display:flex;flex-wrap:wrap;gap:8px;border:0;margin:0;padding:0}' +
      '.radios legend{flex:1 1 100%;font-size:14px;font-weight:600;color:#1a1a1a;padding:0;margin:0 0 8px}' +
      '.radio{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;background:#fff;border:1.5px solid #7C8FA3;border-radius:14px;cursor:pointer;font-size:15px;color:#1a1a1a}' +
      '.radio input{width:18px;height:18px;min-height:0;accent-color:' + cfg.primaryColor + ';margin:0;appearance:auto;-webkit-appearance:auto}' +
      '.radio:has(input:checked){border-color:' + cfg.primaryColor + ';background:' + rgba(cfg.primaryColor, 0.08) + ';font-weight:600}' +
      '.btn{width:100%;min-height:56px;margin-top:18px;padding:14px;border:0;border-radius:14px;font-size:17.5px;font-weight:700;color:' + btnText + ';cursor:pointer;background:linear-gradient(180deg,' + btnBg + ',' + darken(btnBg, 0.17) + ');box-shadow:0 6px 14px -4px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.2)}' +
      '.btn:disabled{opacity:.6;cursor:default}' +
      '.micro{font-size:13px;color:#5c5c5c;text-align:center;margin-top:12px;line-height:1.5}' +
      '.consent{font-size:12px;color:#6e6e6e;margin-top:12px;line-height:1.5}' +
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
      '.headwrap{position:relative}' +
      // Short desktop viewports (1366x768 laptops): compress so the submit
      // button stays above the fold — the template's height media queries.
      '@media (min-width:900px) and (max-height:820px){' +
      '.head{padding-top:16px}.head p{margin-bottom:0}.body{padding-top:10px}' +
      '.row+.row,.row+div,div+.row{margin-top:10px}.more-btn{margin-top:12px;min-height:46px}' +
      '.btn{margin-top:14px}' +
      '}' +
      '@media (min-width:900px) and (max-height:720px){' +
      '.head p{display:none}' +
      'input,select{min-height:44px;padding:10px 12px}' +
      '.row{gap:10px}.row+.row,.row+div,div+.row{margin-top:8px}' +
      '.btn{min-height:50px;margin-top:12px}' +
      // Never hide the consent line or its privacy link — this form collects a
      // mobile number and asks for text permission, so the disclosure has to
      // stay adjacent to the submit control at every viewport. Shrink, don't drop.
      '.consent{font-size:11px;margin-top:8px;line-height:1.4}.micro{margin-top:8px}' +
      '}';
  }

  var uid = 0;
  function buildForm(cfg, onSubmit) {
    var form = el('form', { novalidate: 'novalidate' });
    var fieldErrs = {};
    function field(labelHtml, input, errKey) {
      var wrap = el('div', { class: 'field' });
      // Programmatic label association: label[for] -> input#id, so taps focus
      // the field and screen readers announce it.
      var id = input.id || ('gl-f' + (++uid));
      input.id = id;
      var label = el('label', { html: labelHtml });
      label.setAttribute('for', id);
      wrap.appendChild(label);
      wrap.appendChild(input);
      if (errKey) {
        var p = el('p', { class: 'ferr', id: id + '-err' });
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
        f.input.setAttribute('aria-describedby', f.p.id);
      } else {
        f.p.className = 'ferr';
        f.input.removeAttribute('aria-invalid');
        f.input.removeAttribute('aria-describedby');
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

    /* ---- photo of the damage ----
       The single most useful thing a customer can give a glass shop. A photo
       settles chip-versus-crack, how far it has spread, whether it is in the
       driver's line of sight and whether there is a camera bracket behind it
       — which between them decide whether the job is a repair or a
       replacement, and whether it needs calibration. Without it the shop
       calls back to ask; with it they can quote.

       Uploaded the moment it is chosen, not at submit. The URL is what the
       form carries, so pressing the button is never waiting on a phone photo
       going up a mobile connection. */
    var photoUrl = null;
    var photoInput = el('input', { type: 'file', class: 'photo-in', accept: 'image/*', tabindex: '-1' });
    var photoBtn = el('button', { type: 'button', class: 'photo-btn' });
    photoBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Add a photo of the damage</span>';
    var photoPrev = el('div', { class: 'photo-prev' });
    photoPrev.hidden = true;
    var photoWrap = el('div', {}, [photoInput, photoBtn, photoPrev]);

    photoBtn.addEventListener('click', function () { photoInput.click(); });

    function resetPhoto() {
      photoUrl = null;
      photoInput.value = '';
      photoPrev.hidden = true;
      photoPrev.innerHTML = '';
      photoBtn.hidden = false;
    }

    function showPhotoState(objectUrl, title, subtitle, busy) {
      photoBtn.hidden = true;
      photoPrev.hidden = false;
      photoPrev.innerHTML = '';
      var img = el('img', { alt: '' });
      img.src = objectUrl;
      var meta = el('div', { class: 'photo-meta' });
      meta.appendChild(document.createTextNode(title));
      meta.appendChild(el('small', { text: subtitle }));
      photoPrev.appendChild(img);
      photoPrev.appendChild(meta);
      if (!busy) {
        var x = el('button', { type: 'button', class: 'photo-x', text: 'Remove' });
        x.addEventListener('click', resetPhoto);
        photoPrev.appendChild(x);
      }
    }

    /* Shrink in the browser before uploading.

       Two reasons, and the first one is a hard wall rather than an
       optimisation. A serverless function will not accept a request body over
       ~4.5MB; a photo straight off a modern phone is routinely 3-8MB, so the
       upload was rejected at the edge with a platform error page before any
       of our own code — including the friendly "under 12MB" message — could
       run. Second, the server resizes to 1600px anyway, so every byte above
       that was uploaded over mobile data purely to be thrown away.

       Downscaling to the same 1600px here makes a typical phone photo a few
       hundred KB: it clears the limit with room to spare and turns a
       twenty-second upload on 4G into about one.

       Anything that goes wrong falls back to the original file. A photo is
       worth attempting; it is never worth losing the lead over. */
    var UPLOAD_MAX_EDGE = 1600;

    function shrinkPhoto(file) {
      return new Promise(function (resolve) {
        /* A file already small enough is sent untouched — re-encoding it
           would only lose quality. */
        if (!file || !/^image\//.test(file.type) || file.size < 900 * 1024) return resolve(file);
        if (typeof createImageBitmap !== 'function' || !document.createElement('canvas').getContext) {
          return resolve(file);
        }
        var done = false;
        var bail = function () { if (!done) { done = true; resolve(file); } };
        /* HEIC and anything else the browser cannot decode lands here rather
           than hanging the form on a promise that never settles. */
        var timer = setTimeout(bail, 8000);
        createImageBitmap(file)
          .then(function (bmp) {
            var scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(bmp.width, bmp.height));
            var w = Math.round(bmp.width * scale);
            var h = Math.round(bmp.height * scale);
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
            if (bmp.close) bmp.close();
            canvas.toBlob(function (blob) {
              clearTimeout(timer);
              if (done) return;
              done = true;
              /* Only take the smaller of the two. A tiny PNG screenshot can
                 come back LARGER as a JPEG. */
              resolve(blob && blob.size && blob.size < file.size
                ? new File([blob], 'damage.jpg', { type: 'image/jpeg' })
                : file);
            }, 'image/jpeg', 0.82);
          })
          .catch(function () { clearTimeout(timer); bail(); });
      });
    }

    photoInput.addEventListener('change', function () {
      var f = photoInput.files && photoInput.files[0];
      if (!f) return;
      var objectUrl = URL.createObjectURL(f);
      showPhotoState(objectUrl, 'Uploading…', 'One moment', true);

      shrinkPhoto(f).then(function (ready) {
      var fd = new FormData();
      fd.append('photo', ready);
      return fetch(BASE + '/api/widget/photo?client=' + encodeURIComponent(CLIENT), { method: 'POST', body: fd })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.j || !res.j.url) throw new Error((res.j && res.j.error) || 'Upload failed');
          photoUrl = res.j.url;
          showPhotoState(objectUrl, 'Photo attached', 'The shop will see this with your quote', false);
        })
        .catch(function (e) {
          /* A failed photo must never cost the lead. The form stays entirely
             usable and simply submits without one.

             The reason goes to the console, not to the customer. Upload
             failures are infrastructure — "Photo storage is not configured"
             is a sentence for whoever runs this, and putting it in front of
             somebody trying to get their windscreen fixed reads as the whole
             form being broken. */
          photoUrl = null;
          try { console.warn('[glassleads] photo upload failed:', e && e.message); } catch (_) {}
          showPhotoState(objectUrl, 'Couldn\'t attach that photo', 'No problem — send your request and they will ask if they need it', false);
        });
      });
    });

    // Honeypot: no label, display:none, a name autofill doesn't recognise.
    var hp = el('input', { type: 'text', name: 'hp_check', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var hpWrap = el('div', { class: 'hp', 'aria-hidden': 'true' }, [hp]);

    var btn = el('button', { type: 'submit', text: 'Get my free quote' });
    btn.className = 'btn';
    var err = el('div', { role: 'alert' }); err.className = 'err';

    // Four required fields, not six. The shop follows up by PHONE — the
    // success screen says so — and email was the field most likely to lose
    // someone standing next to a damaged car on their phone. It moves into
    // the optional drawer rather than disappearing.
    var row1 = el('div', { class: 'row' }, [field('Full name' + REQ, name, 'name'), field('Mobile phone' + REQ, phone, 'phone')]);
    var row2 = el('div', { class: 'row' }, [field('Service ZIP' + REQ, zip, 'zip'), field('What do you need?' + REQ, service)]);
    var row3 = el('div', { class: 'row' }, [field('Vehicle' + REQ, vehicle, 'vehicle')]);
    form.appendChild(row1);
    form.appendChild(row2);
    form.appendChild(row3);

    // The photo is the single most useful thing a customer can hand a glass
    // shop — it settles chip-vs-crack, spread, line of sight and whether
    // there's a camera bracket. Burying it in a drawer labelled "optional"
    // told people to skip the best feature on the form.
    var photoField = field('Photo of the damage <span class="opt">— usually saves a callback</span>', photoWrap);
    photoField.className = 'photo-field';
    /* THE LABEL HAS TO POINT AT THE INPUT, NOT THE WRAPPER.
       Every other field hands the field() helper its own control, so label[for]
       lands on something labelable. This one hands it a div holding the hidden
       file input and the button that proxies it — so the label pointed at a div,
       and the real <input type="file"> had no accessible name at all. Found
       by PageSpeed's agent-accessibility audit ("Form elements must have
       labels"), which is a fair complaint from anything reading the page
       through the accessibility tree rather than looking at it: the visible
       button says what it does, and the control it drives said nothing.
       Re-pointing it also makes tapping the label open the picker. */
    var photoLabel = photoField.querySelector('label');
    if (photoLabel) {
      photoInput.id = photoWrap.id ? photoWrap.id + '-input' : 'gl-photo-input';
      photoLabel.setAttribute('for', photoInput.id);
    }
    form.appendChild(photoField);

    var vinField = field('VIN <span class="opt">— optional, gets us the exact glass</span>', vin);
    vinField.appendChild(vinHint);
    var drawer = el('div', { class: 'drawer' });
    drawer.hidden = true;
    drawer.appendChild(vinField);
    drawer.appendChild(field('Email <span class="opt">— optional, for a written quote</span>', email, 'email'));
    drawer.appendChild(radios);
    drawer.appendChild(carrierField);
    drawer.appendChild(field('Anything else? <span class="opt">— optional</span>', notes));

    var moreBtn = el('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false' });
    moreBtn.appendChild(el('span', {
      html: '<span class="more-t">Speed up my quote <span class="opt">(optional)</span></span><br>' +
        '<span class="more-s">VIN, insurance, email — anything that helps them quote</span>'
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
    form.appendChild(el('p', { class: 'micro', text: 'No obligation · No card · We check your coverage before anything is booked' }));
    var consent = el('p', { class: 'consent', text: 'By submitting this form you agree we may contact you by phone, text or email about your quote. Message rates may apply. ' });
    if (cfg.privacyUrl) {
      consent.appendChild(el('a', { href: cfg.privacyUrl, text: 'Privacy Policy', style: 'color:#6e6e6e' }));
      consent.appendChild(document.createTextNode('.'));
    }
    form.appendChild(consent);

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
      check('phone', phone, phDigits(phone.value).length !== 10, 'Please enter a 10-digit mobile number so the shop can reach you.');
      // Optional now — validate the FORMAT only when they actually typed one.
      check('email', email, !!email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()), 'That email address does not look right.');
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
        damage_photo_url: photoUrl,
        insurance: insValue,
        insurance_carrier: insValue === 'yes' ? carrier.value || null : null,
        message: notes.value.trim() || null,
        hp: hp.value || ''
      }, function (ok, friendly, callNumber) {
        if (ok) return;
        btn.disabled = false;
        btn.textContent = 'Get my free quote';
        err.textContent = '';
        /* Built as nodes so the number can be a real tel: link. It was plain
           text, so a visitor whose submission had just failed was asked to
           memorise a number and dial it by hand. */
        if (callNumber) {
          var tail = ' Please call us at ';
          err.appendChild(document.createTextNode(friendly.split(tail)[0] + tail));
          err.appendChild(el('a', {
            href: 'tel:' + String(callNumber).replace(/[^+\d]/g, ''),
            text: callNumber
          }));
          err.appendChild(document.createTextNode('.'));
        } else {
          err.textContent = friendly;
        }
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
    head.appendChild(el('p', { text: "Four quick questions. We'll confirm what your insurance covers before anything is booked — no obligation." }));
    headwrap.appendChild(head);
    card.appendChild(headwrap);
    var body = el('div'); body.className = 'body';

    var form = buildForm(cfg, function (data, fail) {
      var stored = readStored() || attribution || {};
      var payload = {
        first_name: (data.full_name || '').split(' ')[0] || null,
        last_name: (data.full_name || '').split(' ').slice(1).join(' ') || null,
        full_name: data.full_name,
        phone: phE164(data.phone),
        phone_formatted: phPretty(data.phone),
        email: data.email,
        service: data.service,
        vehicle: data.vehicle,
        postal_code: data.postal_code,
        vin: data.vin,
        insurance: data.insurance,
        insurance_carrier: data.insurance_carrier,
        message: data.message,
        damage_photo_url: data.damage_photo_url,

        // Readable companions + aliases for the template sites' key names, so
        // one CRM mapping covers both form types. Additive only.
        service_label: data.service || '',
        insurance_label: INSURANCE_LABEL[data.insurance] || '',
        carrier: data.insurance_carrier || '',
        notes: data.message || '',
        source_label: window.location.host === new URL(BASE).host ? 'Landing page' : 'Website',
        lead_summary: leadSummary({
          name: data.full_name,
          serviceLabel: data.service,
          vehicle: data.vehicle,
          vin: data.vin,
          carrier: data.insurance_carrier
        }),

        form_name: 'glassleads-widget',
        landing_page: stored.landing_page || window.location.href.split('#')[0],
        referrer: stored.referrer || document.referrer || null,
        page: window.location.href.split('#')[0],
        page_path: window.location.pathname,
        // contact_source says what this DOMAIN is for; paid_click says whether
        // this particular visitor actually arrived on an ad click. The two
        // disagree for direct traffic, and only this one can tell you so.
        paid_click: stored.gclid || stored.gbraid || stored.wbraid ? 'yes' : 'no',
        submitted_at: new Date().toISOString(),
        _hp: data.hp
      };
      CLICK_IDS.concat(UTM_KEYS).forEach(function (k) { if (stored[k]) payload[k] = stored[k]; });

      /* Bounded. Without this the request can hang for as long as the
         network lets it, and the submit button sits disabled on "Sending…"
         with no error and no way back — stranding the most valuable visitor
         on the page, the one who filled everything in and pressed the button.
         The catch below already re-enables and explains, so aborting routes
         straight into working recovery. */
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;

      fetch(BASE + '/api/webhooks/highlevel/lead?client=' + encodeURIComponent(CLIENT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        /* Announce the lead to the host page.
           This form lives in a shadow root, which Google's automatic event
           detection cannot see into — without this event a page-level tag has
           no way to know a conversion happened. The detail carries what
           enhanced conversions needs (Google hashes it in the tag; nothing
           identifiable leaves as plaintext beyond this same-page event) and a
           transaction id so a refresh cannot report the same lead twice.
           Client sites can listen for this too. */
        try {
          window.dispatchEvent(new CustomEvent('glassleads:lead', {
            detail: {
              transaction_id: payload.submitted_at + '-' + (payload.phone || payload.email || ''),
              email: payload.email || '',
              phone: payload.phone || '',
              service: payload.service || '',
              paid_click: payload.paid_click
            }
          }));
        } catch (e) {}

        /* Clarity smart event, guarded on the collector actually being there.
           The form lives in a shadow root, so Clarity's automatic click
           detection cannot see it either — the same blindness the host-page
           event above exists to work around. This is the numerator of any
           conversion rate measured on Clarity's side. */
        try {
          if (window.clarity) {
            window.clarity('event', 'quote_submitted');
            window.clarity('set', 'converted', 'yes');
          }
        } catch (e) {}

        body.innerHTML = '';
        /* The head lives on the CARD, outside .body — so clearing the body
           left the confirmation sitting under "Get your free quote — four
           quick questions", i.e. every single person who converted was told,
           directly above the tick, that they had not. That reads as a failed
           submission and produces a duplicate lead or a needless call. */
        head.innerHTML = '';
        head.appendChild(el('h3', { text: 'Request sent' }));
        var first = (data.full_name || '').split(' ')[0] || 'there';
        var ok = el('div', { role: 'status', 'aria-live': 'polite' }); ok.className = 'ok';
        ok.appendChild(el('div', {
          class: 'big',
          html: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
        }));
        var okHead = el('h4', { text: "You're all set, " + first + '.', tabindex: '-1' });
        ok.appendChild(okHead);
        ok.appendChild(el('p', {
          text: 'Your request is with ' + cfg.businessName + '.' + (cfg.phone
            ? ' They will call from ' + cfg.phone + ' to confirm the glass, your coverage and a time — save the number so you do not miss it.'
            : ' They will call to confirm the glass, your coverage and a time that works.')
        }));
        // Only when the shop's line can actually receive a text; an sms:
        // link to a landline is a dead end that costs the lead.
        if (cfg.phone && cfg.smsCapable && !data.damage_photo_url) {
          ok.appendChild(el('p', { text: 'Didn\u2019t send a photo of the damage? Text one to ' + cfg.phone + ' — it is the fastest way to a firm price.' }));
        }
        if (cfg.phone) {
          ok.appendChild(el('a', { href: 'tel:' + cfg.phone.replace(/[^+\d]/g, ''), text: 'Call ' + cfg.businessName + ' — ' + cfg.phone }));
        }
        body.appendChild(ok);
        try { okHead.focus(); } catch (e) {}
        if (onDone) onDone();
      }).catch(function () {
        if (timer) clearTimeout(timer);
        /* A tappable number, not a string to memorise. This is the one screen
           where the form has just failed and calling is the only way through. */
        fail(
          false,
          'Something went wrong sending your request. Please call us at ' +
            (cfg.phone || 'the number on this page') + '.',
          cfg.phone || ''
        );
      });
    });

    body.appendChild(form);
    card.appendChild(body);
    return { card: card, headwrap: headwrap };
  }

  function mountInline(container, cfg) {
    /* Carry across anything already typed.

       The container now holds a REAL, working form rather than a skeleton, so
       it can be used the moment the HTML arrives — about a second before this
       script does. Clearing it without reading it first would silently wipe
       what someone had started, on the one element the whole page exists for. */
    var carried = {};
    try {
      var prior = container.querySelectorAll('input[name], textarea[name], select[name]');
      for (var p = 0; p < prior.length; p++) {
        var field = prior[p];
        if (field.name && field.name !== '_hp' && field.value) carried[field.name] = field.value;
      }
    } catch (e) {}

    // Clear the server-rendered form before mounting the richer card.
    container.textContent = '';
    var host = el('div');
    container.appendChild(host);
    var shadow = host.attachShadow({ mode: 'open' });
    var style = el('style', { text: buildStyles(cfg) });
    shadow.appendChild(style);
    var built = buildCard(cfg, null);
    // Message-match: a service page names its service on the container and
    // the select starts there instead of the global default.
    /* Restore what was typed into the no-script form, best effort: a field
       the richer card does not have is simply dropped rather than throwing. */
    try {
      Object.keys(carried).forEach(function (name) {
        var target = built.card.querySelector('[name="' + name + '"]');
        if (target && !target.value) target.value = carried[name];
      });
    } catch (e) {}

    var wanted = container.getAttribute('data-service');
    if (wanted) {
      var select = built.card.querySelector('select[name="service"]');
      if (select) {
        for (var i = 0; i < select.options.length; i++) {
          if (select.options[i].value.toLowerCase() === wanted.toLowerCase()) {
            select.selectedIndex = i;
            break;
          }
        }
      }
    }
    shadow.appendChild(built.card);
    watchStickyBar(container, shadow);
  }

  // Hide the page's sticky call bar while any quote form is on screen or
  // being typed into — it must never compete with the form or sit over the
  // keyboard. Drawn-by-default: no JS support, no observer → bar stays.
  var stickyState = { vis: 0, focus: 0 };
  function applyStickyBar() {
    var bar = document.querySelector('[data-gl-mobilebar]');
    if (bar) bar.style.display = stickyState.vis > 0 || stickyState.focus > 0 ? 'none' : '';
  }
  function watchStickyBar(container, shadow) {
    if (!document.querySelector('[data-gl-mobilebar]') || !('IntersectionObserver' in window)) return;
    var wasVisible = false;
    try {
      new IntersectionObserver(function (entries) {
        var nowVisible = entries[0] ? entries[0].isIntersecting : false;
        if (nowVisible !== wasVisible) {
          stickyState.vis += nowVisible ? 1 : -1;
          wasVisible = nowVisible;
          applyStickyBar();
        }
      }, { threshold: 0.15 }).observe(container);
      shadow.addEventListener('focusin', function () { stickyState.focus++; applyStickyBar(); });
      shadow.addEventListener('focusout', function () { stickyState.focus = Math.max(0, stickyState.focus - 1); applyStickyBar(); });
    } catch (e) {}
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
      var close = el('button', { type: 'button', text: '×', 'aria-label': 'Close quote form' });
      close.className = 'close';
      close.addEventListener('click', function () { overlay.style.display = 'none'; });
      built.headwrap.appendChild(close);
      built.card.setAttribute('role', 'dialog');
      built.card.setAttribute('aria-modal', 'true');
      built.card.setAttribute('aria-label', 'Get your free quote');
      overlay.appendChild(built.card);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') overlay.style.display = 'none';
      });
      shadow.appendChild(overlay);
    });
  }

  function mountAll(cfg) {
    cfg.primaryColor = ensureDark(cfg.primaryColor);
    var containers = document.querySelectorAll('[data-glassleads-widget]');
    if (containers.length > 0) {
      for (var i = 0; i < containers.length; i++) mountInline(containers[i], cfg);
    } else {
      mountFloating(cfg);
    }
  }

  // If the widget can't build (blocked fetch, flaky network), the quote
  // targets must not dead-end into an empty box: replace the container with
  // a plain call card so the page still converts by phone.
  function mountFallback() {
    var phone = script.getAttribute('data-phone');
    var containers = document.querySelectorAll('[data-glassleads-widget]');
    for (var i = 0; i < containers.length; i++) {
      var c = containers[i];
      c.textContent = '';
      var card = el('div');
      card.style.cssText = 'background:#fff;border:1px solid #e2d8d8;border-radius:20px;padding:24px;text-align:center;font-family:sans-serif;box-shadow:0 10px 20px -6px rgba(20,20,20,.08)';
      card.appendChild(el('p', { text: 'Call for your free quote — it takes about a minute.' }));
      if (phone) {
        var a = el('a', { href: 'tel:' + phone.replace(/[^+\d]/g, ''), text: 'Call ' + phone });
        a.style.cssText = 'display:block;margin-top:10px;padding:14px;border-radius:12px;background:#1a1a1a;color:#fff;font-weight:700;text-decoration:none';
        card.appendChild(a);
      }
      c.appendChild(card);
    }
  }

  function init() {
    // The host site inlines the config so the form renders without a round
    // trip; third-party embeds fall back to fetching it.
    var inline = script.getAttribute('data-config');
    if (inline) {
      try {
        mountAll(JSON.parse(inline));
        return;
      } catch (e) { /* fall through to fetch */ }
    }
    fetch(BASE + '/api/widget/config?client=' + encodeURIComponent(CLIENT))
      .then(function (res) { if (!res.ok) throw new Error('config ' + res.status); return res.json(); })
      .then(mountAll)
      .catch(function (err) {
        console.warn('[glassleads] widget failed to load:', err);
        mountFallback();
      });
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
