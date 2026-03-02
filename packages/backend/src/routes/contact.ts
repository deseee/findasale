import { Router, Request, Response } from 'express';
import { Resend } from 'resend';

const router = Router();

let _resend: any = null;
const getResend = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
};

// POST /api/contact — public contact form submission
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }

    if (message.length > 5000) {
      return res.status(400).json({ message: 'Message too long (max 5000 characters).' });
    }

    const supportEmail = process.env.SUPPORT_EMAIL || 'support@salescout.app';
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@salescout.app';
    const resend = getResend();

    if (resend) {
      // Forward to support inbox
      await resend.emails.send({
        from: fromEmail,
        to: supportEmail,
        replyTo: email,
        subject: `[SaleScout Contact] ${subject}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#2563eb;">New Contact Form Submission</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px;font-weight:bold;width:120px;">Name</td><td style="padding:8px;">${name}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;"><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Subject</td><td style="padding:8px;">${subject}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;vertical-align:top;">Message</td><td style="padding:8px;white-space:pre-wrap;">${message}</td></tr>
            </table>
          </div>
        `,
      });

      // Send confirmation to submitter
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: 'We received your message – SaleScout',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#2563eb;">Thanks for reaching out, ${name}!</h2>
            <p>We've received your message and will get back to you within 1–2 business days.</p>
            <p style="color:#6b7280;font-size:13px;">Your message: <em>${subject}</em></p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;">SaleScout &mdash; <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}">salescout.app</a></p>
          </div>
        `,
      });
    } else {
      // Email not configured — log to console for dev
      console.log('[Contact Form]', { name, email, subject, message });
    }

    res.json({ message: 'Message sent successfully.' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ message: 'Failed to send message. Please try again.' });
  }
});

export default router;
