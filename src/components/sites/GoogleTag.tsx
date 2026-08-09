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
 * 2. CALL CLICKS, and only when a call label is configured. Every tel: link
 *    on the page is covered by one delegated listener, so the header, the
 *    util bar, the mobile bar, the location cards and the footer are all
 *    tracked without each one having to remember to be. Leave the label empty
 *    when HighLevel's Number Pool Calling reports calls instead — two systems
 *    reporting the same call is how an account double-counts.
 *
 * Both paths dedupe through sessionStorage on a transaction id, so a refresh
 * or a double-click cannot report twice.
 */
export function GoogleTag({ tracking }: { tracking: AdsTracking | null }) {
  if (!tracking) return null

  const { conversionId, leadSendTo, callSendTo, enhancedConversions } = tracking

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
          enhancedConversions ? ", { allow_enhanced_conversions: true }" : ''
        });

(function () {
  var LEAD_SEND_TO = ${JSON.stringify(leadSendTo)};
  var CALL_SEND_TO = ${JSON.stringify(callSendTo)};
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
    window.gtag('event', 'conversion', {
      send_to: sendTo,
      transaction_id: transactionId
    });
  }

  // 1. Form leads — announced by the widget, which is inside a shadow root.
  window.addEventListener('glassleads:lead', function (event) {
    var detail = (event && event.detail) || {};
    var userData = {};
    if (detail.email) userData.email = detail.email;
    if (detail.phone) userData.phone_number = detail.phone;
    report(LEAD_SEND_TO, detail.transaction_id || 'lead-' + Date.now(), userData);
  });

  // 2. Call clicks — one delegated listener covers every tel: link, including
  //    ones added to the DOM later.
  if (CALL_SEND_TO) {
    document.addEventListener('click', function (event) {
      var link = event.target && event.target.closest && event.target.closest('a[href^="tel:"]');
      if (!link) return;
      // Per click, not per number: the same visitor calling twice is two
      // conversions, but one click reported twice is not.
      report(CALL_SEND_TO, 'call-' + Date.now(), null);
    }, true);
  }
})();
        `}
      </Script>
    </>
  )
}
