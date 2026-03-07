/**
 * Unified Email Template Builder
 *
 * Provides a consistent HTML email design system for FindA.Sale.
 * All transactional and marketing emails should use buildEmail() to ensure
 * consistent branding, accessibility, and responsive design.
 */

import { regionConfig } from '../config/regionConfig';

export interface EmailOptions {
  preheader?: string;          // Preview text shown in email clients (50-100 chars recommended)
  headline: string;            // Large heading inside email
  body: string;                // Main HTML content (can include paragraphs, item cards, etc.)
  ctaText?: string;            // Button text (e.g., "Complete Purchase")
  ctaUrl?: string;             // Button URL
  footerNote?: string;         // Small text below button (optional secondary message)
  accentColor?: string;        // Default: '#d97706' (amber). Use '#10b981' for success, '#dc2626' for urgent
}

export interface ItemCardData {
  title: string;
  price: number;               // In cents (e.g., 1500 = $15.00)
  photoUrl?: string;
  url: string;
  category?: string;
}

/**
 * Build a complete, responsive HTML email with FindA.Sale branding.
 *
 * Features:
 * - 600px max-width centered container on light grey background
 * - FindA.Sale header with Fraunces serif branding
 * - Preheader for email client preview
 * - Customizable accent color (amber, green, red, etc.)
 * - Full-width responsive design
 * - Professional footer with unsubscribe placeholder
 *
 * @param options Email configuration
 * @returns Complete HTML email string ready to send via Resend/SES/etc
 */
export function buildEmail(options: EmailOptions): string {
  const {
    preheader = '',
    headline,
    body,
    ctaText,
    ctaUrl,
    footerNote,
    accentColor = '#d97706',
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FindA.Sale</title>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;">
  <!-- Preheader text (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${preheader}
  </div>

  <!-- Main table wrapper for email clients -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafaf9; padding: 24px 16px;">
    <tr>
      <td align="center">
        <!-- Card container (600px max) -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color: ${accentColor}; padding: 28px 32px; text-align: center;">
              <div style="font-family: 'Fraunces', serif; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">FindA.Sale</div>
              <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255, 255, 255, 0.85); font-weight: 500;">Estate Sales, Simplified</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px;">
              <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 600; color: #1f2937; line-height: 1.4;">
                ${headline}
              </h1>

              <div style="font-size: 15px; color: #374151; line-height: 1.6;">
                ${body}
              </div>

              ${
                ctaText && ctaUrl
                  ? `
              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${ctaUrl}" style="display: inline-block; padding: 14px 32px; background-color: ${accentColor}; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; line-height: 1;">
                  ${ctaText}
                </a>
              </div>
              ${
                footerNote
                  ? `<p style="font-size: 13px; color: #6b7280; text-align: center; margin: 16px 0 0;">${footerNote}</p>`
                  : ''
              }
              `
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f9f7f4; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0; line-height: 1.6;">
                © 2026 FindA.Sale · ${regionConfig.city}, ${regionConfig.stateAbbrev}<br />
                <a href="[UNSUBSCRIBE_URL]" style="color: #9ca3af; text-decoration: none;">Manage preferences</a> ·
                <a href="[UNSUBSCRIBE_URL]" style="color: #9ca3af; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build a responsive HTML snippet for an item card suitable for inclusion in email body.
 *
 * Features:
 * - Image thumbnail (if provided)
 * - Title and price
 * - Category and link
 * - Consistent styling with email template
 *
 * @param item Item data
 * @returns HTML snippet safe to embed in buildEmail() body parameter
 */
export function buildItemCard(item: ItemCardData): string {
  const price = (item.price / 100).toFixed(2);

  return `
<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 12px; background-color: #fff; overflow: hidden;">
  ${
    item.photoUrl
      ? `<img src="${item.photoUrl}" alt="${item.title}" style="width: 100%; max-height: 160px; object-fit: cover; border-radius: 6px; margin-bottom: 10px; display: block;" />`
      : ''
  }
  <div style="font-weight: 600; font-size: 15px; color: #1f2937; margin-bottom: 4px;">
    ${item.title}
  </div>
  <div style="color: #d97706; font-weight: 700; font-size: 16px; margin-bottom: 4px;">
    $${price}
  </div>
  ${item.category ? `<div style="color: #6b7280; font-size: 13px; margin-bottom: 10px;">${item.category}</div>` : ''}
  <a href="${item.url}" style="display: inline-block; padding: 6px 14px; background-color: #d97706; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">
    View Item
  </a>
</div>`;
}
