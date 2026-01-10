# Google Ads API Design Documentation

## Tool Name
Auto Glass Marketing Command Center - Lead Conversion Tracking System

## Company Information
- **Company Name:** [Your Company Name]
- **Website:** [Your Website URL]
- **Contact Email:** [Your Email]

---

## 1. Tool Description

### Overview
The Auto Glass Marketing Command Center is a marketing automation platform designed for auto glass repair and replacement businesses. The platform manages content creation, social media publishing, and **lead tracking with Google Ads conversion attribution**.

### Primary Purpose of Google Ads API Integration
Our tool uses the Google Ads API to:
1. **Enhanced Conversions for Leads** - Send hashed first-party data (email, phone) when leads are captured from Google Ads campaigns
2. **Offline Conversion Import** - Report sales/revenue data back to Google Ads when leads convert to paying customers

This enables our clients (auto glass businesses) to:
- Measure true ROI of their Google Ads campaigns
- Optimize bidding strategies based on actual sales data
- Improve Smart Bidding performance with offline conversion signals

---

## 2. Target Users

### Who Will Use This Tool
- **Agency Users (Us):** We manage Google Ads campaigns for multiple auto glass businesses under our MCC (Manager Account)
- **Business Owners (Clients):** Auto glass shop owners who view their leads and report sales through a client portal

### User Authentication
- Agency users authenticate via Google OAuth to connect the MCC account
- Client portal users authenticate via magic link (email-based passwordless auth)
- Clients do NOT have direct access to Google Ads API - they only interact through our portal UI

---

## 3. Google Ads API Features Used

### 3.1 Enhanced Conversions for Leads
**API Endpoint:** `ConversionAdjustmentUploadService`

**Purpose:** When a lead submits a form on a landing page (from a Google Ads click), we capture the GCLID and send hashed user identifiers to Google Ads for improved conversion measurement.

**Data Sent:**
- GCLID (Google Click ID) - captured from URL parameter
- Hashed email address (SHA-256, normalized)
- Hashed phone number (SHA-256, E.164 format)
- Conversion action ID
- Conversion date/time

**Trigger:** Automatically when a new lead is created via HighLevel webhook with a valid GCLID

### 3.2 Offline Conversion Import
**API Endpoint:** `ConversionUploadService.UploadClickConversions`

**Purpose:** When a client marks a lead as "Sold" and enters a sale value, we report this conversion back to Google Ads so the revenue can be attributed to the original ad click.

**Data Sent:**
- GCLID (from original lead capture)
- Conversion action ID (for sales)
- Conversion value (sale amount in USD)
- Conversion date/time

**Trigger:** When a client updates a lead status to "Sold" with a sale value in the client portal

### 3.3 Customer and Conversion Action Queries
**API Endpoint:** `GoogleAdsService.SearchStream`

**Purpose:**
- List accessible customer accounts under our MCC
- Retrieve available conversion actions for each client's Google Ads account

**Usage:** Admin configuration only - to link clients to their Google Ads customer IDs and select appropriate conversion actions

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     LEAD CAPTURE FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Google Ads    ──►  Landing Page    ──►  Form Submit           │
│  (with GCLID)       (HighLevel)          (HighLevel)           │
│                                               │                 │
│                                               ▼                 │
│                                    ┌──────────────────┐        │
│                                    │ Webhook to our   │        │
│                                    │ platform with    │        │
│                                    │ contact + GCLID  │        │
│                                    └────────┬─────────┘        │
│                                             │                   │
│                                             ▼                   │
│                              ┌──────────────────────────┐      │
│                              │  Create Lead Record      │      │
│                              │  Store: email, phone,    │      │
│                              │  GCLID, UTM params       │      │
│                              └────────────┬─────────────┘      │
│                                           │                     │
│                                           ▼                     │
│                              ┌──────────────────────────┐      │
│                              │  Send Enhanced           │      │
│                              │  Conversion to           │      │
│                              │  Google Ads API          │      │
│                              │  (hashed email/phone)    │      │
│                              └──────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  OFFLINE CONVERSION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Client Portal    ──►  Update Lead     ──►  Mark as "Sold"     │
│  (authenticated)       Status               + Sale Value        │
│                                                   │             │
│                                                   ▼             │
│                                    ┌──────────────────────┐    │
│                                    │  If GCLID exists:    │    │
│                                    │  Send Offline        │    │
│                                    │  Conversion to       │    │
│                                    │  Google Ads API      │    │
│                                    │  (GCLID + value)     │    │
│                                    └──────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. OAuth Implementation

### OAuth Flow
1. Admin navigates to Settings → Google Ads in our platform
2. Admin enters OAuth Client ID and Client Secret (from Google Cloud Console)
3. Admin clicks "Connect Google Ads"
4. User is redirected to Google's OAuth consent screen
5. User authorizes access to Google Ads API (scope: `https://www.googleapis.com/auth/adwords`)
6. Google redirects back to our callback URL with authorization code
7. We exchange the code for access and refresh tokens
8. Tokens are encrypted and stored in our database

### Token Management
- Access tokens are refreshed automatically when expired
- Refresh tokens are stored encrypted (AES-256)
- Only one MCC connection per installation (agency model)

### OAuth Credentials Storage
- OAuth Client ID: Encrypted in database
- OAuth Client Secret: Encrypted in database
- Access Token: Encrypted in database
- Refresh Token: Encrypted in database
- Developer Token: Encrypted in database

---

## 6. Data Security & Privacy

### Data Handling
- **Email addresses:** Normalized (lowercase, trimmed) and hashed with SHA-256 before sending to Google
- **Phone numbers:** Converted to E.164 format and hashed with SHA-256 before sending to Google
- **GCLID:** Stored as-is (required for conversion attribution)
- **No PII sent in plaintext:** Only hashed identifiers are transmitted to Google Ads API

### Database Security
- All sensitive credentials encrypted at rest using AES-256
- Database hosted on secure cloud infrastructure (Vercel/Neon PostgreSQL)
- HTTPS enforced for all API communications

### Access Control
- Only authenticated admin users can configure Google Ads settings
- Client portal users can only view/update their own leads
- API calls are server-side only (no client-side API access)

---

## 7. API Usage Patterns

### Expected API Call Volume
- **Enhanced Conversions:** ~10-50 calls per day per client (based on lead volume)
- **Offline Conversions:** ~5-20 calls per day per client (based on sales)
- **Customer/Conversion Action Queries:** <10 calls per day (admin configuration only)

### Rate Limiting
- We implement exponential backoff for failed requests
- Batch processing is used where applicable
- API calls are made asynchronously to avoid blocking user operations

---

## 8. User Interface Screenshots

### Admin: Google Ads Settings
The admin interface allows configuration of:
- OAuth Client ID and Secret
- MCC Customer ID
- Developer Token
- OAuth connection status

### Admin: Client Google Ads Configuration
Per-client configuration includes:
- Client's Google Ads Customer ID (under MCC)
- Lead Conversion Action selection
- Sale Conversion Action selection

### Client Portal: Lead Management
Clients can:
- View their leads with contact information
- Update lead status (New → Contacted → Qualified → Quoted → Sold/Lost)
- Enter sale value and date when marking as Sold
- (Sale data automatically triggers offline conversion import)

---

## 9. Compliance

### Google Ads API Terms of Service
We agree to comply with all Google Ads API Terms of Service, including:
- Not selling or redistributing Google Ads data
- Respecting user privacy and data protection regulations
- Implementing proper security measures for credential storage
- Using the API only for legitimate advertising management purposes

### Data Retention
- Lead data retained according to client agreements
- Conversion data retained for reporting purposes
- Clients can request data deletion at any time

---

## 10. Contact Information

**Developer Contact:**
- Name: [Your Name]
- Email: [Your Email]
- Phone: [Your Phone]

**Technical Support:**
- Email: [Support Email]

---

*Document Version: 1.0*
*Last Updated: [Current Date]*
