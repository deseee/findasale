import { prisma } from './prisma';
import { emailService } from './emailService';
import { suppressionService } from '../services/suppressionService';

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
        const recipient = user.email;
        // Skip placeholder / scraper addresses — email only (in-app notification already created above)
        const isPlaceholder =
          !recipient ||
          !recipient.includes('@') ||
          recipient.toLowerCase().endsWith('@system.finda.sale');
        if (isPlaceholder) {
          console.log(`[notificationService] Skipping email to placeholder address: ${recipient}`);
        } else if (await suppressionService.isSuppressed(recipient)) {
          console.log(`[notificationService] Skipping suppressed recipient: ${recipient}`);
        } else {
          const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
          try {
            await emailService.emails.send({
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
