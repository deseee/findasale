// Message Notification Email Service
// Sends email notifications when users receive new messages

import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { buildEmail } from './emailTemplateService';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

interface NewMessageNotification {
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  saleTitle: string | null;
  conversationId: string;
  messagePreview: string;
}

/**
 * Send email notification for new message
 * Non-blocking: wraps send in setImmediate to avoid blocking response
 */
export async function sendNewMessageEmail(notification: NewMessageNotification): Promise<void> {
  try {
    const messageLink = `${FRONTEND_URL}/messages/${notification.conversationId}`;

    const emailHtml = buildEmail({
      preheader: `New message from ${notification.senderName}`,
      headline: `New message from ${notification.senderName}`,
      body: `
<p style="margin: 0 0 16px; color: #374151;">
  You have a new message${notification.saleTitle ? ` about <strong>${notification.saleTitle}</strong>` : ''}.
</p>
<p style="margin: 0; padding: 16px; background-color: #f3f4f6; border-left: 4px solid #d97706; border-radius: 4px; color: #374151; line-height: 1.6; font-style: italic;">
  "${notification.messagePreview}"
</p>
      `,
      ctaText: 'Read Message',
      ctaUrl: messageLink,
      footerNote: 'Reply directly in the message thread',
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: notification.recipientEmail,
      subject: `New message from ${notification.senderName}`,
      html: emailHtml,
    });

    console.log(`[messageEmail] Sent notification to ${notification.recipientEmail}`);
  } catch (err) {
    console.error(`[messageEmail] Failed to send to ${notification.recipientEmail}:`, err);
    throw err;
  }
}

/**
 * Trigger email notification for new message
 * Call this after creating a message in the database
 */
export async function notifyNewMessage(conversationId: string, messageId: string): Promise<void> {
  // Fire-and-forget in background
  setImmediate(async () => {
    try {
      // Fetch message, conversation, and recipient details
      const [message, conversation] = await Promise.all([
        prisma.message.findUnique({
          where: { id: messageId },
          include: { sender: { select: { id: true, name: true } } },
        }),
        prisma.conversation.findUnique({
          where: { id: conversationId },
          include: {
            shopperUser: { select: { id: true, email: true, name: true } },
            organizer: {
              select: {
                userId: true,
                user: { select: { email: true, name: true } },
              },
            },
            sale: { select: { id: true, title: true } },
          },
        }),
      ]);

      if (!message || !conversation) {
        console.log('[messageEmail] Message or conversation not found');
        return;
      }

      // Determine recipient (the one who didn't send the message)
      const isOrganizerSender = message.sender.id === conversation.organizer.userId;
      const recipientEmail = isOrganizerSender
        ? conversation.shopperUser?.email
        : conversation.organizer.user.email;
      const recipientName = isOrganizerSender
        ? conversation.shopperUser?.name || 'Shopper'
        : conversation.organizer.user.name || 'Organizer';

      if (!recipientEmail) {
        console.log('[messageEmail] No recipient email found');
        return;
      }

      // Trim preview to 150 chars
      const messagePreview = message.body.substring(0, 150) + (message.body.length > 150 ? '...' : '');

      await sendNewMessageEmail({
        recipientEmail,
        recipientName,
        senderName: message.sender.name || 'A user',
        saleTitle: conversation.sale?.title || null,
        conversationId,
        messagePreview,
      });
    } catch (err) {
      console.error('[messageEmail] Error notifying message:', err);
    }
  });
}
