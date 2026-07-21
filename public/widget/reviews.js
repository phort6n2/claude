/* Windshield Repair HQ — embeddable Google-review widget.
 * Usage on any shop's website:
 *   <script src="https://windshieldrepairhq.com/widget/reviews.js" data-shop="your-slug" async></script>
 * Renders a small Google-reviews badge (rating + count) wherever the tag sits.
 * Self-contained: no dependencies, inline styles, one JSON fetch. */
(function () {
  var script = document.currentScript
  if (!script) {
    var all = document.querySelectorAll('script[data-shop]')
    script = all[all.length - 1]
  }
  if (!script) return
  var slug = script.getAttribute('data-shop')
  if (!slug) return
  var origin = new URL(script.src).origin

  var mount = document.createElement('div')
  script.parentNode.insertBefore(mount, script.nextSibling)

  function stars(rating) {
    var wrap = document.createElement('span')
    wrap.setAttribute('aria-label', rating.toFixed(1) + ' out of 5')
    wrap.style.cssText = 'display:inline-flex;gap:1px;vertical-align:middle'
    for (var i = 1; i <= 5; i++) {
      var pct = Math.max(0, Math.min(1, rating - (i - 1))) * 100
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.setAttribute('viewBox', '0 0 24 24')
      var gid = 'wrhq-s-' + i + '-' + Math.floor(pct)
      s.innerHTML =
        '<defs><linearGradient id="' + gid + '"><stop offset="' + pct + '%" stop-color="#fbbf24"/><stop offset="' + pct + '%" stop-color="#e5e7eb"/></linearGradient></defs>' +
        '<path fill="url(#' + gid + ')" d="M12 17.3l-6.16 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.48 4.73 1.64 7.03z"/>'
      wrap.appendChild(s)
    }
    return wrap
  }

  function googleG() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('viewBox', '0 0 48 48')
    s.style.cssText = 'vertical-align:middle;flex:none'
    s.innerHTML =
      '<path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>' +
      '<path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z"/>' +
      '<path fill="#FBBC05" d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/>' +
      '<path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.94 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>'
    return s
  }

  fetch(origin + '/api/directory/widget/reviews?shop=' + encodeURIComponent(slug))
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (!d || d.rating == null) return // nothing to show yet
      var card = document.createElement('div')
      card.style.cssText =
        'display:inline-flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid #e5e7eb;' +
        'border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05);' +
        'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.2'

      var left = document.createElement('div')
      left.appendChild(googleG())

      var mid = document.createElement('div')
      var top = document.createElement('div')
      top.style.cssText = 'display:flex;align-items:center;gap:6px'
      var num = document.createElement('strong')
      num.textContent = Number(d.rating).toFixed(1)
      num.style.cssText = 'font-size:16px;color:#111827'
      top.appendChild(num)
      top.appendChild(stars(Number(d.rating)))
      var sub = document.createElement('div')
      sub.style.cssText = 'font-size:12px;color:#6b7280;margin-top:2px'
      var link = document.createElement('a')
      link.href = d.reviewsUrl || d.listingUrl
      link.target = '_blank'; link.rel = 'noopener'
      link.textContent = (d.count || 0) + ' Google reviews'
      link.style.cssText = 'color:#2563eb;text-decoration:none'
      sub.appendChild(link)
      mid.appendChild(top); mid.appendChild(sub)

      card.appendChild(left); card.appendChild(mid)

      var credit = document.createElement('a')
      credit.href = d.listingUrl; credit.target = '_blank'; credit.rel = 'noopener'
      credit.textContent = 'via Windshield Repair HQ'
      credit.style.cssText = 'display:block;margin-top:6px;font-size:10px;color:#9ca3af;text-decoration:none'

      mount.appendChild(card)
      mount.appendChild(credit)
    })
    .catch(function () {})
})()
