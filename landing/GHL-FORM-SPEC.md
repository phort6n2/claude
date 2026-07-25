# Rebuilding the quote form in HighLevel

Everything needed to make a GHL form match the custom form on the landing page.
Once it's built, send the embed code and it drops straight into the page.

---

## 1. Fields (in this order)

| # | Label | Type | Required | Placeholder / options |
|---|-------|------|----------|----------------------|
| 1 | `Full name` | Text | ✅ | `Jordan Miller` |
| 2 | `Email` | Email | ✅ | `jordan@email.com` |
| 3 | `Mobile phone` | Phone | ✅ | `(720) 555-0134` |
| 4 | `Service ZIP` | Text / Postal | ✅ | `80202` |
| 5 | `Vehicle — year, make, model (optional)` | Text | ❌ | `2021 Toyota RAV4` |
| 6 | `What do you need?` | Dropdown | ✅ | see below |
| 7 | `Filing through insurance?` | Radio | ✅ | `Yes — check my $0` / `Paying out of pocket` |
| 8 | `Insurance carrier` | Dropdown | ❌ | see below |

Fields 3 and 4 sit **side by side** (2 columns) in the original. In GHL, put them
in a single row with two columns.

**Field 6 — "What do you need?" options:**
```
Windshield replacement
Rock chip / crack repair
Door or side window
Back glass
ADAS calibration
Not sure — help me decide
```

**Field 8 — "Insurance carrier" options:**
```
State Farm
GEICO
Progressive
Allstate
USAA
Farmers
American Family
Other
```

> **Conditional logic (optional):** in the original, field 8 only appears when
> field 7 = "Yes — check my $0". GHL supports this under the field's
> conditional-logic settings. If it's fiddly, just leave carrier always visible —
> it's a minor loss.

### Click IDs (important for Google Ads)

**GCLID is a STANDARD field in GHL** — do not create a custom field for it.
Map the incoming `gclid` straight to that standard field. That is also where
GHL's "Add to Google Ads" action looks for the click ID, so putting it there
is what lets the conversion fire.

Check whether `gbraid` and `wbraid` are standard in your account too. If they
aren't, create them as custom fields — Google sends those *instead of* `gclid`
on iOS and consent-mode traffic, so skipping them loses those conversions.

The rest are custom fields (or hidden form fields, if using a GHL form):

```
msclkid        fbclid         ttclid        li_fat_id
utm_source     utm_medium     utm_campaign
utm_term       utm_content    landing_page  referrer
```

The landing page appends all of these to the form URL / webhook payload
automatically.

---

## 2. Copy

- **Heading:** `Get your free quote`
- **Badge (top right):** `60-SEC REPLY`
- **Subtext:** `Tell us about your vehicle — we'll text you a price and the next available time.`
- **Submit button:** `Text Me My Price & $0 Check →`
- **Under the button:** `🔒 No spam. Your info is only used for your quote.`
- **Consent line:** `By submitting, you agree to receive texts about your quote. Msg & data rates may apply. Reply STOP to opt out.`

**Keep the consent line** — you're texting leads, so it matters for TCPA/A2P.

---

## 3. Colors & type

| Element | Value |
|---------|-------|
| Card background | `#151A21` (or gradient `#1C232C` → `#151A21`) |
| Input background | `#0E1319` |
| Border (inputs + card) | `#28313C` |
| Body / input text | `#EAEEF3` |
| Placeholder text | `#55606C` |
| Field label text | `#8592A0` |
| Muted subtext | `#9BA6B2` |
| **Accent / button** | `#FFC53D` |
| Button text | `#1A1200` |
| Focus ring | `#FFC53D` at 18% opacity |
| Badge background | `#4ADE80` (green), text `#0B0E12` |
| Accent stripe (card top) | gradient `#FFC53D` → `#5AD1F0` |

**Geometry:** card radius `22px`, padding `28px`; input radius `11px`, padding
`13px 14px`, font-size `15.5px`; button radius `999px` (full pill), padding
`16px 26px`, weight `800`.

**Labels** are uppercase, `10.5px`, letter-spacing `.11em`, in a monospace font.
That detail is a lot of the character — worth replicating.

---

## 4. Paste-ready custom CSS for GHL

In the GHL form builder: **Styles → Custom CSS**. Selectors vary by GHL version,
so if something doesn't take, inspect the field and adjust the selector.

```css
/* ---- HV Auto Glass — match landing page form ---- */
.form-builder--wrapper,
form {
  background: linear-gradient(180deg, #1C232C, #151A21) !important;
  border: 1px solid #28313C !important;
  border-radius: 22px !important;
  padding: 28px !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
}

/* Headings & helper text */
h1, h2, h3, .form-heading { color: #EAEEF3 !important; font-weight: 800 !important; letter-spacing: -.02em !important; }
p, .form-description { color: #9BA6B2 !important; font-size: 14px !important; }

/* Field labels — uppercase mono, this carries the look */
label, .form-label {
  color: #8592A0 !important;
  font-size: 10.5px !important;
  letter-spacing: .11em !important;
  text-transform: uppercase !important;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace !important;
  margin-bottom: 6px !important;
}

/* Inputs */
input[type="text"], input[type="email"], input[type="tel"],
input[type="number"], select, textarea {
  background: #0E1319 !important;
  border: 1px solid #28313C !important;
  border-radius: 11px !important;
  color: #EAEEF3 !important;
  font-size: 15.5px !important;
  padding: 13px 14px !important;
  width: 100% !important;
  box-shadow: none !important;
}
input::placeholder, textarea::placeholder { color: #55606C !important; }

/* Focus state */
input:focus, select:focus, textarea:focus {
  outline: none !important;
  border-color: #FFC53D !important;
  box-shadow: 0 0 0 3px rgba(255,197,61,.18) !important;
}

/* Radio / checkbox labels stay sentence case */
.radio-label, .checkbox-label, input[type="radio"] + label, input[type="checkbox"] + label {
  text-transform: none !important;
  font-family: inherit !important;
  font-size: 13.5px !important;
  letter-spacing: 0 !important;
  color: #EAEEF3 !important;
}

/* Submit button — amber pill */
button[type="submit"], .btn-submit, .form-btn {
  background: #FFC53D !important;
  color: #1A1200 !important;
  border: none !important;
  border-radius: 999px !important;
  font-weight: 800 !important;
  font-size: 16px !important;
  padding: 16px 26px !important;
  width: 100% !important;
  box-shadow: 0 10px 30px -8px rgba(255,197,61,.5) !important;
  cursor: pointer !important;
  transition: transform .18s ease, box-shadow .18s ease !important;
}
button[type="submit"]:hover, .btn-submit:hover, .form-btn:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 16px 40px -8px rgba(255,197,61,.6) !important;
}
```

---

## 5. When the form is ready

Send the embed code. On the page side I'll:

1. Drop the iframe into the branded card (header, badge and trust line stay outside
   it, so they keep the page's exact typography).
2. Switch the embed container to its **dark variant** so it blends into the card
   instead of showing a white panel — already built, it's a one-class change.
3. Keep forwarding `gclid` / `utm_*` into the iframe URL so your Google Ads
   conversion automation keeps matching clicks.
