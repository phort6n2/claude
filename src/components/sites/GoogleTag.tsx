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

  const { conversionId, leadSendTo, leadValue, leadCurrency, callSendTo, callPhoneNumber, enhancedConversions } =
    tracking

  return (
    <>
      <Script
        id="gl-gtag-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${conversionId}`}
      />
      <Script id="gl-gtag-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
gtag('js', new Date());
gtag('config', ${JSON.stringify(conversionId)}${
          enhancedConversions ? ', { allow_enhanced_conversions: true }' : ''
        });
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
  var ENHANCED = ${enhancedConversions ? 'true' : 'false'};

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
