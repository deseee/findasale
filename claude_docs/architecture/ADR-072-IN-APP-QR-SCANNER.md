# ADR-072: In-App QR Code Scanner for Treasure Hunt

**Status:** Locked (Patrick S572) — awaiting findasale-dev implementation
**Date:** 2026-04-24
**Context:** Patrick request — "little camera button somewhere so they can scan organizer QR codes without leaving the app"
**Related:** Treasure Hunt feature (pages/sales/[id]/treasure-hunt-qr/[clueId].tsx), existing camera infra (RapidCapture, PreviewModal)

---

## 1. Library Choice

**Recommendation: `html5-qrcode`**

`html5-qrcode` provides a bundled (~100KB), well-maintained QR decoder that integrates cleanly with `getUserMedia`. It handles frame capture and decode in one package, reducing complexity versus `jsqr` (which requires manual frame extraction). `@zxing/browser` is too heavy (~250KB) for a secondary feature and overkill for QR-only decoding. Bundle impact on PWA: ~100KB gzipped, acceptable given treasure hunt is an organizer-facing secondary flow.

---

## 2. Button Placement

**Primary Recommendation: Persistent Camera Icon in Main Navigation**

Location: `BottomTabNav` on mobile + discrete camera icon next to search bar on desktop.
- **Mobile:** Add camera tab to `BottomTabNav.tsx` — always visible to shoppers on sale pages, hidden on auth pages (`/login`, `/register`) and organizer-only routes (`/organizer/*`).
- **Desktop:** Small icon button (📷 or gear-styled) in top nav header, hidden on same auth/organizer routes.
- **Rationale:** Shoppers may scan from anywhere during a sale (discover clue on floor → immediately scan organizer's posted QR). Persistent placement removes friction vs. AvatarDropdown (too hidden) or floating button (visual clutter, PWA-native feel doesn't match).

---

## 3. Permission Flow

**First Tap: Request Camera Access**

1. User taps camera button → trigger `getUserMedia({ video: { facingMode: 'environment' } })`
2. Browser shows system permission dialog (iOS Safari / Android Chrome)
3. On grant → full-screen scanner overlay (mobile) or centered modal (desktop)
4. On deny → user-friendly error modal: "Camera access needed. [Settings link]"

**Permission Caching & Per-Session Reuse**
- Granted permissions persist per session (browser closes permission prompt on subsequent taps)
- No second dialog on re-scan within same session
- Different users or incognito mode: permission re-requested
- Mobile quirks:
  - **iOS Safari:** Always requests permission first tap. PWA mode may ask again after app restart.
  - **Android Chrome:** Grants once per session. Permission revokable in Settings.

**Rejection Handling:**
- Show toast: "Camera access denied. Allow in browser settings to scan."
- Provide link to browser settings help doc (e.g., "How to enable camera" guide)

---

## 4. Decode-to-Route Logic

**Valid Targets:**
- `https://finda.sale/sales/[saleId]/treasure-hunt-qr/[clueId]` → primary (auto-navigate in-app via `router.push()`)
- Any other `finda.sale` domain URL → route in-app (no full page reload)
- External URLs → show confirm modal: "This QR code links to [URL] — leave FindA.Sale to open it?" → require explicit tap to navigate away

**Invalid / Malformed QRs:**
- Non-URL text → toast: "Invalid QR code. Expected a link."
- Domain spoofing risk (e.g., `finda-sale.com`): regex validation on domain before routing; invalid domain shows warning modal

---

## 5. Component Structure

**New files:**
- `components/qr-scanner/QRScannerButton.tsx` — trigger button (mounts in nav)
- `components/qr-scanner/QRScannerModal.tsx` — full-screen overlay
- `components/qr-scanner/useQRScanner.ts` — custom hook (html5-qrcode integration)

**Integration points:**
- `Layout.tsx` or `BottomTabNav.tsx` → mounts QRScannerButton
- Hooks handle `getUserMedia`, frame capture, decode, toast notifications
- Router integration via Next.js `useRouter()`

**Hook shape:**
```typescript
const useQRScanner = (isOpen: boolean) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decodedUrl = (text: string) => { /* validate & route */ }
  const startScanner = async () => { /* request permission, init html5-qrcode */ }
  const stopScanner = () => { /* cleanup */ }
  return { scanning, error, startScanner, stopScanner, decodedUrl }
}
```

---

## 6. Failure Modes & Telemetry

| Scenario | Handling | Telemetry |
|----------|----------|-----------|
| No camera (desktop) | Show friendly message: "No camera found on this device." | Log to console (info) |
| Permission denied | Toast + help link to settings | Log event: `qr_permission_denied` |
| QR decoded but invalid URL | Toast: "Invalid QR code." | Log event: `qr_invalid_url` |
| QR decoded, external domain | Confirm modal before nav away | Log event: `qr_external_domain_attempt` |
| User cancels (close btn, Esc) | Close overlay, cleanup stream | No log (expected) |
| Scanner times out (15s no QR) | Subtle hint: "Point at a QR code" | Log event: `qr_scan_timeout` |

**Optional telemetry (deferred to post-launch):**
- Track scan-to-clue conversion rate (scans that lead to treasure hunt page vs. abandoned)
- User engagement: time-in-scanner, re-scan rate

---

## 7. Estimated Effort

**Size: Medium (M)**

**Rationale:**
- ~400 lines of new TSX (button + modal + hook)
- html5-qrcode integration is straightforward (minimal custom wrapper needed)
- iOS/Android permission flows tested in RapidCapture (reuse patterns)
- Decode-to-route logic simple (regex + Next.js router)
- No schema, no API changes, no backend work
- Testing: basic happy path (QR → treasure hunt page), permission denied, invalid URLs

**Timeline: 1–2 dev sessions (~4–6 hours design + code + test)**

---

## 8. Locked Decisions (Patrick S572)

1. **Desktop visibility — YES.** Camera button shows on desktop too. If `navigator.mediaDevices.getUserMedia` resolves with no available video devices, surface a friendly empty-state in the modal ("Your device doesn't have a camera — try this on your phone") rather than hiding the button preemptively.

2. **Analytics — YES, integrated into the existing `/organizer/qr-codes` page.** Add a "Scanner Funnel" section on the organizer's QR Analytics page showing:
   - `scan_initiated` (button tapped, modal opened)
   - `scan_decoded_on_domain` (a finda.sale QR was successfully decoded)
   - `scan_decoded_off_domain` (a non-finda.sale URL was decoded — triggered the security confirm modal)
   - `scan_camera_denied` (user denied or revoked camera permission)
   - `scan_completed` (decoded → routed → existing `/found` endpoint succeeded; this number should equal existing `qrScanCount` per sale)
   The first four are NEW dimensions. The fifth (`scan_completed`) is already counted by `Sale.qrScanCount` on the existing endpoint — don't double-count. Surface as a small funnel card on `/organizer/qr-codes` keyed by sale.

3. **First-time coaching — YES, light touch.** First-time-only tooltip on the camera button ("New: scan organizer QR codes from anywhere in the app"). Inside the scanner modal on first open: a subtle help line under the viewfinder ("Hold steady — we'll detect the QR automatically"). Both gated by a single `localStorage.qrScannerSeen` flag, dismissible by use (auto-dismisses after first successful scan or first close).

---

## 9. Schema Impact

**None.** Treasure hunt QR endpoint already exists (`GET /sales/:id/treasure-hunt-qr/:clueId`). Scanner is read-only (no new records, mutations, or fields needed).

Optional future: `QRScanLog` table (scanner_id, sale_id, decoded_url, success, timestamp) for organizer analytics dashboard. **Defer to post-launch.**

---

## 10. Rollout Plan

1. **Dev dispatch:** findasale-dev implements all three files + hook, tests on mobile + desktop
2. **QA dispatch:** findasale-qa verifies permission flows (iOS + Android), external URL warning, permission denial recovery
3. **Launch:** Deploy to main; announce to shoppers via changelog or toast
4. **Monitor:** Check error logs for permission denials, invalid URLs, timeout patterns over first week
5. **Iterate:** Refine UX (tweak hints, adjust timeout, add badge if needed) based on feedback

---

## Decision Log

- **D-001:** Library choice locked as `html5-qrcode` (vs. jsqr / @zxing). Trade-off: bundle size vs. integration ease favors bundled approach.
- **D-002:** Permission flow requires explicit user tap on deny (not auto-retry). Respects browser security model.
- **D-003:** External URL navigation requires confirm modal (security: prevent blind redirects via spoofed QRs).
- **D-004:** Telemetry SHIPS at launch — integrated into existing `/organizer/qr-codes` analytics page as "Scanner Funnel" card per locked decision §8.2.
- **D-005:** Desktop visibility ON; webcam-absent state shows friendly empty state, not hidden button (Patrick S572).
- **D-006:** First-time coaching tooltip + modal hint, single `localStorage.qrScannerSeen` flag (Patrick S572).
