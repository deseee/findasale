import { prisma } from './prisma';
import { Resend } from 'resend';

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  sendEmail?: boolean;
  emailSubject?: string;
  channel?: string;
}

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try {
      _resend = new Resend(process.env.RESEND_API_KEY);
    } catch {
      _resend = null;
    }
  }
  return _resend;
};

/**
 * Create an in-app notification and optionally send email.
 * Fails open: email send errors don't block notification creation.
 */
export const createNotification = async (input: CreateNotificationInput) => {
  const { userId, type, title, body, link, sendEmail, emailSubject, channel } = input;

  try {
    // Write to Notification table
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        link: link ?? null,
        channel: channel || 'OPERATIONAL',
      },
    });

    // Send email if requested
    if (sendEmail) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user?.email) {
        const resend = getResendClient();
        if (resend) {
          const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@finda.sale';
          try {
            await resend.emails.send({
              from: fromEmail,
              to: user.email,
              subject: emailSubject || title,
              html: `<p>Hi ${user.name},</p><p>${body}</p>${link ? `<p><a href="${process.env.FRONTEND_URL}${link}">View Details</a></p>` : ''}`,
            });
          } catch (emailError) {
            // Fail open: log but don't throw
            console.error('Failed to send notification email:', emailError);
          }
        }
      }
    }

    return notification;
  } catch (error) {
    console.error('createNotification error:', error);
    throw error;
  }
};
