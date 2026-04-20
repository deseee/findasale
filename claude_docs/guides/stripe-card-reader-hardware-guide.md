# Stripe Card Reader Hardware for FindA.Sale POS

**Who this is for:** Organizers using the FindA.Sale Point of Sale (POS) feature to accept card payments at their sales.

---

## Quick Answer: Which Reader Do I Need?

FindA.Sale is a web app (PWA), which means it uses Stripe's **JavaScript SDK**. Only WiFi-connected smart readers work with the JavaScript SDK. Bluetooth readers (like the M2) and Tap to Pay require a native iOS or Android app — they do not work with FindA.Sale.

**For most organizers: Stripe Reader S700 ($299)** — WiFi, customer-facing screen, works at any table or counter.

**For fixed shop setups (antique dealers, consignment stores, resale shops): S700 or S710** — same device, S710 adds cellular for venues with unreliable WiFi.

---

## Compatible Readers

### Stripe Reader S700 — $299
**Best for: Estate sale organizers, yard sales, flea market vendors, antique dealers, consignment stores, resale shops**

- **How it connects:** WiFi (same network as your phone/tablet)
- **Accepts:** Tap (contactless/NFC), chip insert, swipe
- **Screen:** 5.5" color touchscreen — customers see the transaction and can sign/tip on screen
- **Use it if:** You have a checkout table at your sale, or you run a fixed-location resale shop using Shop Mode

The S700 connects over WiFi — your phone running FindA.Sale POS and the reader just need to be on the same network. No cable between them. The customer-facing screen shows the item total and lets them tap or insert their card directly.

---

### Stripe Reader S710 — $299
**Best for: Sale venues with unreliable WiFi, outdoor events, markets**

Same device as the S700, with added **cellular (LTE) connectivity**. Falls back to LTE if WiFi drops. Useful for outdoor flea markets, estate sales in older homes, or any venue where the WiFi signal is inconsistent.

---

### BBPOS WisePOS E — $249
**Best for: Organizers who already have one from a previous Stripe setup**

- **How it connects:** WiFi or Ethernet (via optional $49 dock)
- **Accepts:** Tap, chip, swipe
- **Screen:** 5" color touchscreen
- **Use it if:** You already own one — it works identically to the S700 with FindA.Sale POS

The WisePOS E is a solid reader but the S700 is the more current device. Either works fine.

---

## Not Compatible with FindA.Sale

### Stripe Reader M2 — ❌ Does not work with FindA.Sale
The M2 connects via Bluetooth and only supports Stripe's iOS, Android, and React Native native app SDKs. FindA.Sale is a web app (PWA) — it uses the JavaScript SDK, which the M2 does not support. Do not purchase the M2 for use with FindA.Sale.

### Tap to Pay (iPhone / Android) — ❌ Does not work with FindA.Sale
Tap to Pay on iPhone and Android uses NFC hardware built into the phone, but it requires Stripe's native iOS/Android SDK. FindA.Sale runs in the browser and cannot access device NFC for payment processing.

---

## Transaction Fees

All Stripe Terminal card readers use the same rate:

**2.7% + 5¢ per successful transaction** (US cards)
**+1.5%** for international cards

No monthly fees or minimums for the hardware itself.

---

## How to Order

1. Log into your **Stripe Dashboard** at [dashboard.stripe.com](https://dashboard.stripe.com)
2. Go to **Terminal → Hardware**
3. Select your reader and add to cart
4. Hardware ships from Stripe directly — typical delivery is 3–5 business days

Contact Stripe sales if you need multiple units.

---

## Which Reader Should I Get?

| Your situation | Recommended reader |
|---|---|
| Running a sale with a checkout table | S700 ($299) |
| Fixed shop (antique store, consignment, resale) | S700 ($299) |
| Outdoor event or venue with bad WiFi | S710 ($299, adds cellular) |
| Already have a WisePOS E | WisePOS E ($249) — it still works |
| Want the M2 or Tap to Pay | Not compatible — see above |

---

## Frequently Asked Questions

**Do I need WiFi at my sale?**
Yes. The S700, S710 (on WiFi), and WisePOS E all require your phone and reader to be on the same WiFi network. The S710 adds cellular as a fallback if WiFi drops.

**Can I use the same reader at multiple sales?**
Yes. Your reader is linked to your Stripe account, not a specific sale. Bring it to the next event and connect it in the app.

**Can multiple staff use the same reader?**
One reader connects to one device at a time. If you have multiple checkout points, you need a reader per station.

**Does the M2 work if I have Android?**
No — the M2 still doesn't work with FindA.Sale regardless of what phone you have. The incompatibility is with the FindA.Sale PWA (web app), not your device type. FindA.Sale uses the JavaScript SDK which requires a WiFi-connected smart reader.

**What if I want to accept card payments but can't afford a reader right now?**
The FindA.Sale POS also supports cash transactions and manual payment recording. Card readers are only needed for card acceptance.

---

*Hardware pricing accurate as of April 2026. Check [stripe.com/terminal/devices](https://stripe.com/terminal/devices) for current pricing.*
