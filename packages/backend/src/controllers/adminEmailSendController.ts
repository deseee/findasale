import { Request, Response } from 'express';

/**
 * adminEmailSendController — TEMPORARILY STUBBED (S1022 hotfix).
 *
 * The full strictly-controlled admin email-send implementation broke the backend
 * build (shipped via `tsc || true`, no blocking CI gate at the time), which left
 * `admin.ts` importing a controller that failed to load and crashed the process
 * on boot. This safe stub keeps the `/api/admin/send-email` route importable and
 * the backend healthy. The endpoint is DISABLED: it always returns 403.
 *
 * Re-implement the full version (admin-auth + recipient allowlist + EMAIL_SEND_ENABLED
 * kill-switch + daily cap + confirm flag + audit log) only behind a verified CI
 * typecheck run, then remove this stub.
 */
export async function adminSendEmail(_req: Request, res: Response): Promise<Response> {
  return res
    .status(403)
    .json({ success: false, error: 'Email send endpoint is disabled.' });
}
