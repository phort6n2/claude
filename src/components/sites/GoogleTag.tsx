import Script from 'next/script'
import type { AdsTracking } from '@/lib/ads-tracking'

/**
 * Google Ads tag for a hosted client site.
 *
 * Rendered only when the client has a conversion ID, so a site with no Ads
 * account loads no third-party script at all.
 *
 * Two conversions come from this page:
 *
 * 1. FORM LEADS. The quote form lives in a shadow DOM, which Google's
 *    automatic event detection cannot see into — so the widget announces its
 *    own success as a `glassleads:lead` CustomEvent and the listener below
 *    reports it. This is why the conversion action must be set to "page load"
 *    in the Ads UI rather than click: the page fires it explicitly.
 *
 * 2. CALLS, when a "calls from a website" action is configured. That is
 *    Google's own mechanism: the extra gtag config below hands it the number
 *    printed on the page, Google swaps it for a forwarding number, and counts
 *    calls that actually connect for long enough. It is strictly better than
 *    counting tel: clicks — a click is not a call — so there is no click
 *    listener here to double-count against it.
 *
 *    Leave it unconfigured when HighLevel's Number Pool Calling is swapping
 *    the same number. Two swap systems competing for one number is a broken
 *    phone number on the page, not just bad data.
 *
 * The lead path dedupes through sessionStorage on a transaction id, so a
 * refresh cannot report the same submission twice.
 */
export function GoogleTag({ tracking }: { tracking: AdsTracking | null }) {
  if (!tracking) return null

  const {
    conversionId,
    leadSendTo,
    leadValue,
    leadCurrency,
    callSendTo,
    callPhoneNumber,
    enhancedConversions,
    bingUetTagId,
    bingLeadEventAction,
    bingCallEventAction,
    ga4MeasurementId,
    metaPixelId,
    metaTestMode,
    privacyChoices,
  } = tracking

  return (
    <>
      {privacyChoices && <OptOutFlag />}
      {bingUetTagId && (
        <BingUetTag
          tagId={bingUetTagId}
          eventAction={bingLeadEventAction || 'submit_lead_form'}
          callAction={bingCallEventAction}
          enhanced={enhancedConversions}
          privacyChoices={privacyChoices}
        />
      )}
      {metaPixelId && <MetaPixel pixelId={metaPixelId} testMode={metaTestMode} />}
      {conversionId || ga4MeasurementId ? (
        <GoogleAdsTag
          conversionId={conversionId}
          ga4MeasurementId={ga4MeasurementId}
          leadSendTo={leadSendTo}
          leadValue={leadValue}
          leadCurrency={leadCurrency}
          callSendTo={callSendTo}
          callPhoneNumber={callPhoneNumber}
          enhancedConversions={enhancedConversions}
          privacyChoices={privacyChoices}
        />
      ) : null}
    </>
  )
}

function GoogleAdsTag({
  conversionId,
  ga4MeasurementId,
  leadSendTo,
  leadValue,
  leadCurrency,
  callSendTo,
  callPhoneNumber,
  enhancedConversions,
  privacyChoices,
}: {
  conversionId: string
  ga4MeasurementId: string | null
  leadSendTo: string | null
  leadValue: number | null
  leadCurrency: string | null
  callSendTo: string | null
  callPhoneNumber: string | null
  enhancedConversions: boolean
  privacyChoices: boolean
}) {
  return (
    <>
      {/* ONE loader for both products. gtag.js is loaded once, with
          whichever id exists, and each product gets its own config line
          below. Loading a second copy for Analytics is the usual mistake and
          it costs a request on every page for nothing. */}
      <Script
        id="gl-gtag-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${conversionId || ga4MeasurementId}`}
      />
      <Script id="gl-gtag-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
gtag('js', new Date());
${
  // A visitor who opted out of "sharing" (GPC or the site link) keeps
  // conversion MEASUREMENT — Google's restricted data processing mode is
  // the documented CCPA setting for exactly this — but loses the ad
  // personalisation side, and no hashed email or phone is sent for them.
  // Set before any config line, which is where Google reads it. Only for a
  // client with privacy choices on; every other site renders byte-for-byte
  // as before.
  privacyChoices ? `if (window.__glOptedOut) gtag('set', 'restricted_data_processing', true);` : ''
}
${
  conversionId
    ? `gtag('config', ${JSON.stringify(conversionId)}${
        enhancedConversions ? ', { allow_enhanced_conversions: true }' : ''
      });`
    : ''
}
${
  // Analytics is configured separately from Ads and reports page views by
  // itself. Linking the property to the Ads account happens in Google's own
  // UI — nothing here can do it, and pretending otherwise would leave
  // somebody believing it was handled.
  ga4MeasurementId ? `gtag('config', ${JSON.stringify(ga4MeasurementId)});` : ''
}
${
  callSendTo && callPhoneNumber
    ? `// Calls from a website: Google swaps this number on the page and reports
// the calls itself.
gtag('config', ${JSON.stringify(callSendTo)}, { phone_conversion_number: ${JSON.stringify(
        callPhoneNumber
      )} });`
    : ''
}

(function () {
  var LEAD_SEND_TO = ${JSON.stringify(leadSendTo)};
  var LEAD_VALUE = ${leadValue === null ? 'null' : JSON.stringify(leadValue)};
  var LEAD_CURRENCY = ${JSON.stringify(leadCurrency)};
  var ENHANCED = ${enhancedConversions ? 'true' : 'false'}${privacyChoices ? ' && !window.__glOptedOut' : ''};

  // One report per transaction id per session. Survives a refresh, which a
  // plain in-memory flag would not.
  function alreadyReported(key) {
    try {
      if (sessionStorage.getItem(key)) return true;
      sessionStorage.setItem(key, '1');
      return false;
    } catch (e) {
      return false; // Private mode: better to risk a duplicate than lose one.
    }
  }

  function report(sendTo, transactionId, userData) {
    if (!sendTo || !window.gtag) return;
    if (alreadyReported('gl_conv_' + transactionId)) return;
    if (ENHANCED && userData) {
      try { window.gtag('set', 'user_data', userData); } catch (e) {}
    }
    var params = { send_to: sendTo, transaction_id: transactionId };
    if (LEAD_VALUE !== null) {
      params.value = LEAD_VALUE;
      if (LEAD_CURRENCY) params.currency = LEAD_CURRENCY;
    }
    window.gtag('event', 'conversion', params);
  }

  // 1. Form leads — announced by the widget, which is inside a shadow root.
  window.addEventListener('glassleads:lead', function (event) {
    var detail = (event && event.detail) || {};
    // A dry run (lib/lead-test-mode.ts) stored nothing; reporting it would put
    // a conversion in the Ads account for a lead that does not exist.
    if (detail.test) return;
    var userData = {};
    if (detail.email) userData.email = detail.email;
    if (detail.phone) userData.phone_number = detail.phone;
    report(LEAD_SEND_TO, detail.transaction_id || 'lead-' + Date.now(), userData);
  });

  // Calls need no listener: the phone_conversion_number config above hands
  // the whole job to Google, which counts connected calls rather than clicks.
})();
        `}
      </Script>
    </>
  )
}

/**
 * Microsoft Advertising (Bing) UET tag.
 *
 * UET is Microsoft's equivalent of the Google tag: one numeric tag installed
 * site-wide, after which conversions are "event goals" matched by ACTION
 * NAME. That matching is string equality — the action pushed here and the one
 * typed into the goal have to agree exactly, which is why the action is
 * configured rather than hardcoded, and why the admin shows the value it will
 * push.
 *
 * The same shadow-DOM problem applies as for Google, and the same
 * `glassleads:lead` event solves it.
 *
 * Enhanced conversions differ from Google's in one way worth knowing:
 * Microsoft accepts plaintext and hashes it in the browser, but the phone
 * number must already be in E.164 — which is exactly what the widget now
 * sends, so it is passed straight through.
 */
function BingUetTag({
  tagId,
  eventAction,
  callAction,
  enhanced,
  privacyChoices,
}: {
  tagId: string
  eventAction: string
  callAction: string | null
  enhanced: boolean
  privacyChoices: boolean
}) {
  return (
    <Script id="gl-uet" strategy="afterInteractive">
      {`
${
  // Opted out of sharing: no UET at all — Microsoft's tag is an advertising
  // tag with no restricted mode to fall back to. Only on a client with
  // privacy choices on; everyone else renders exactly as before.
  privacyChoices ? 'if (!window.__glOptedOut) ' : ''
}(function (w, d, t, r, u) {
  var f, n, i;
  w[u] = w[u] || [];
  f = function () {
    var o = { ti: ${JSON.stringify(tagId)}, enableAutoSpaTracking: true };
    o.q = w[u];
    w[u] = new UET(o);
    w[u].push('pageLoad');
  };
  n = d.createElement(t); n.src = r; n.async = 1;
  n.onload = n.onreadystatechange = function () {
    var s = this.readyState;
    if (!s || s === 'loaded' || s === 'complete') { f(); n.onload = n.onreadystatechange = null; }
  };
  i = d.getElementsByTagName(t)[0];
  i.parentNode.insertBefore(n, i);
})(window, document, 'script', '//bat.bing.com/bat.js', 'uetq');

(function () {
  var ACTION = ${JSON.stringify(eventAction)};
  var ENHANCED = ${enhanced ? 'true' : 'false'};

  window.addEventListener('glassleads:lead', function (event) {
    var detail = (event && event.detail) || {};
    if (detail.test) return;${privacyChoices ? `
    if (window.__glOptedOut) return;` : ''}
    try {
      window.uetq = window.uetq || [];
      // Microsoft hashes these itself; the phone has to arrive already
      // formatted E.164, which is what the widget sends.
      var params = ENHANCED
        ? { pid: { em: detail.email || '', ph: detail.phone || '' } }
        : {};
      window.uetq.push('event', ACTION, params);
    } catch (e) {}
  });
${
  callAction
    ? `
  // A tap on any call link — header, sticky bar, body, or the quote card's
  // own links inside its shadow root (composedPath reaches into it). A tap is
  // not a call, which is why this is a separate goal from the lead and why
  // it is off until somebody names the action.
  var CALL_ACTION = ${JSON.stringify(callAction)};
  document.addEventListener('click', function (event) {${privacyChoices ? `
    if (window.__glOptedOut) return;` : ''}
    var path = event.composedPath ? event.composedPath() : [event.target];
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (el && el.tagName === 'A' && /^tel:/i.test(el.getAttribute('href') || '')) {
        try {
          window.uetq = window.uetq || [];
          window.uetq.push('event', CALL_ACTION, { event_category: 'contact', event_label: 'call' });
        } catch (e) {}
        return;
      }
    }
  }, true);`
    : ''
}
})();
      `}
    </Script>
  )
}

/**
 * Has this visitor opted out of "sharing"? The browser's Global Privacy
 * Control signal (which California treats as a valid opt-out) or the site's
 * own "Your Privacy Choices" link, which sets gl_optout. Decided once, before
 * any tag runs, and read by each of them as window.__glOptedOut.
 */
function OptOutFlag() {
  // A plain inline script, not next/script: it runs as the HTML is parsed,
  // so it has always run before any afterInteractive tag reads the flag.
  return (
    <script
      id="gl-optout"
      dangerouslySetInnerHTML={{
        __html:
          'try{window.__glOptedOut=navigator.globalPrivacyControl===true||/(?:^|; )gl_optout=1(?:;|$)/.test(document.cookie)}catch(e){window.__glOptedOut=false}',
      }}
    />
  )
}

/**
 * Meta (Facebook / Instagram) Pixel.
 *
 * The queue is defined at once, so a Lead fired a second after load is held
 * rather than lost, but fbevents.js itself is fetched only after the page has
 * loaded and the browser is idle: it is ~90 KB of somebody else's script, and
 * a landing page that slows down to load it costs more leads than the Pixel
 * measures.
 *
 * Events: PageView on load; Lead on a form submission, with the SAME eventID
 * the server sends to the Conversions API so Meta keeps one of the pair; and
 * Contact on a tap on a call link — Meta's standard event for a phone
 * contact. Lead is kept for forms on purpose: Meta credits view-through, so a
 * call tap from a visitor who once scrolled past an ad would otherwise count
 * as a Meta lead and blur the number Meta optimises on.
 *
 * Never loaded for a visitor who opted out of sharing; a client with a Pixel
 * always has privacy choices on.
 */
function MetaPixel({ pixelId, testMode }: { pixelId: string; testMode: boolean }) {
  return (
    <Script id="gl-meta-pixel" strategy="afterInteractive">
      {`
(function () {
  if (window.__glOptedOut) return;
  if (window.fbq) return;
  var n = window.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!window._fbq) window._fbq = n;
  n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
  window.fbq('init', ${JSON.stringify(pixelId)});
  window.fbq('track', 'PageView');

  function load() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    var f = document.getElementsByTagName('script')[0];
    f.parentNode.insertBefore(s, f);
  }
  function whenIdle() {
    if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 4000 });
    else setTimeout(load, 1500);
  }
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle);

  var TEST_MODE = ${testMode ? 'true' : 'false'};
  window.addEventListener('glassleads:lead', function (event) {
    var detail = (event && event.detail) || {};
    // A dry run fires the Pixel only while a Test Events code is set, i.e.
    // while somebody is checking the browser and server events pair up.
    if (detail.test && !TEST_MODE) return;
    try {
      window.fbq('track', 'Lead', {}, detail.event_id ? { eventID: detail.event_id } : undefined);
    } catch (e) {}
  });

  document.addEventListener('click', function (event) {
    var path = event.composedPath ? event.composedPath() : [event.target];
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (el && el.tagName === 'A' && /^tel:/i.test(el.getAttribute('href') || '')) {
        try { window.fbq('track', 'Contact'); } catch (e) {}
        return;
      }
    }
  }, true);
})();
      `}
    </Script>
  )
}
