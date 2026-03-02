import { prisma } from '../index';
import { Resend } from 'resend';
import twilio from 'twilio';

const resend = new Resend(process.env.RESEND_API_KEY);

// Lazy-loaded Twilio client
let _twilioClient: any = null;
const getTwilioClient = () => {
  if (!_twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      try {
        _twilioClient = twilio(accountSid, authToken);
      } catch (error) {
        console.warn('⚠️ Failed to initialize Twilio client in emailReminderService:', error);
        _twilioClient = null;
      }
    }
  }
  return _twilioClient;
};

interface ReminderEmail {
  to: string;
  saleName: string;
  saleAddress: string;
  startDate: Date;
  saleUrl: string;
  reminderType: 'one-day' | 'two-hours';
}

interface ReminderSMS {
  to: string;
  saleName: string;
  saleAddress: string;
  startDate: Date;
  reminderType: 'one-day' | 'two-hours';
}

const formatSaleDateTime = (date: Date): string => {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getEmailTemplate = (reminder: ReminderEmail): { subject: string; html: string } => {
  const formattedDate = formatSaleDateTime(reminder.startDate);

  if (reminder.reminderType === 'one-day') {
    return {
      subject: `Reminder: ${reminder.saleName} starts tomorrow!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Don't forget about ${reminder.saleName}!</h2>
          <p style="font-size: 16px; color: #666;">This estate sale starts tomorrow:</p>

          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">${reminder.saleName}</h3>
            <p style="margin: 8px 0; color: #666;">
              📍 ${reminder.saleAddress}
            </p>
            <p style="margin: 8px 0; color: #666;">
              🕐 ${formattedDate}
            </p>
          </div>

          <p style="font-size: 16px; color: #666;">
            <a href="${reminder.saleUrl}" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Sale Details
            </a>
          </p>

          <p style="font-size: 14px; color: #999; margin-top: 30px;">
            You're receiving this because you're watching this sale on SaleScout.
          </p>
        </div>
      `,
    };
  }

  return {
    subject: `${reminder.saleName} starts in 2 hours!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Estate sale happening soon!</h2>
        <p style="font-size: 16px; color: #666;">This sale you're watching starts in just 2 hours:</p>

        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${reminder.saleName}</h3>
          <p style="margin: 8px 0; color: #666;">
            📍 ${reminder.saleAddress}
          </p>
          <p style="margin: 8px 0; color: #666;">
            🕐 ${formattedDate}
          </p>
        </div>

        <p style="font-size: 16px; color: #666;">
          <a href="${reminder.saleUrl}" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Get Directions & Details
          </a>
        </p>

        <p style="font-size: 14px; color: #999; margin-top: 30px;">
          You're receiving this because you're watching this sale on SaleScout.
        </p>
      </div>
    `,
  };
};

const getSMSTemplate = (reminder: ReminderSMS): string => {
  const formattedDate = formatSaleDateTime(reminder.startDate);

  if (reminder.reminderType === 'one-day') {
    return `🏷️ Reminder: ${reminder.saleName} starts tomorrow at ${formattedDate}. 📍 ${reminder.saleAddress}`;
  }

  return `⏰ Sale happening soon! ${reminder.saleName} starts in 2 hours. 📍 ${reminder.saleAddress}`;
};

export const sendReminderEmail = async (reminder: ReminderEmail): Promise<void> => {
  try {
    const { subject, html } = getEmailTemplate(reminder);

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@salescout.app',
      to: reminder.to,
      subject,
      html,
    });

    console.log(`✓ Reminder email sent to ${reminder.to} for ${reminder.saleName}`);
  } catch (error) {
    console.error(`✗ Failed to send reminder email to ${reminder.to}:`, error);
  }
};

export const sendReminderSMS = async (reminder: ReminderSMS): Promise<void> => {
  try {
    const twilioClient = getTwilioClient();
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      console.warn('⚠️ Twilio not configured - skipping SMS reminder');
      return;
    }

    const smsBody = getSMSTemplate(reminder);

    await twilioClient.messages.create({
      body: smsBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: reminder.to,
    });

    console.log(`✓ Reminder SMS sent to ${reminder.to} for ${reminder.saleName}`);
  } catch (error) {
    console.error(`✗ Failed to send reminder SMS to ${reminder.to}:`, error);
  }
};

export const processReminderEmails = async (): Promise<void> => {
  try {
    const now = new Date();

    // Get sales starting in the next 26 hours (for 1-day reminders)
    const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oneDayAndTwoHoursLater = new Date(now.getTime() + 26 * 60 * 60 * 1000);

    // Get sales starting in the next 2.5 hours (for 2-hour reminders)
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoHoursAndThirtyMinsLater = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);

    // Fetch sales for 1-day reminders (include both email and phone)
    const salesToRemindOneDayBefore = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        startDate: {
          gte: oneDayLater,
          lte: oneDayAndTwoHoursLater,
        },
      },
      include: {
        subscribers: {
          select: { email: true, phone: true },
        },
      },
    });

    // Send 1-day reminders (email + SMS)
    for (const sale of salesToRemindOneDayBefore) {
      const saleUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sales/${sale.id}`;

      for (const subscriber of sale.subscribers) {
        // Send email
        if (subscriber.email) {
          await sendReminderEmail({
            to: subscriber.email,
            saleName: sale.title,
            saleAddress: `${sale.address}, ${sale.city}, ${sale.state}`,
            startDate: sale.startDate,
            saleUrl,
            reminderType: 'one-day',
          });
        }

        // Send SMS if phone is provided
        if (subscriber.phone) {
          await sendReminderSMS({
            to: subscriber.phone,
            saleName: sale.title,
            saleAddress: `${sale.address}, ${sale.city}, ${sale.state}`,
            startDate: sale.startDate,
            reminderType: 'one-day',
          });
        }
      }
    }

    // Fetch sales for 2-hour reminders (include both email and phone)
    const salesToRemindTwoHoursBefore = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        startDate: {
          gte: twoHoursLater,
          lte: twoHoursAndThirtyMinsLater,
        },
      },
      include: {
        subscribers: {
          select: { email: true, phone: true },
        },
      },
    });

    // Send 2-hour reminders (email + SMS)
    for (const sale of salesToRemindTwoHoursBefore) {
      const saleUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sales/${sale.id}`;

      for (const subscriber of sale.subscribers) {
        // Send email
        if (subscriber.email) {
          await sendReminderEmail({
            to: subscriber.email,
            saleName: sale.title,
            saleAddress: `${sale.address}, ${sale.city}, ${sale.state}`,
            startDate: sale.startDate,
            saleUrl,
            reminderType: 'two-hours',
          });
        }

        // Send SMS if phone is provided
        if (subscriber.phone) {
          await sendReminderSMS({
            to: subscriber.phone,
            saleName: sale.title,
            saleAddress: `${sale.address}, ${sale.city}, ${sale.state}`,
            startDate: sale.startDate,
            reminderType: 'two-hours',
          });
        }
      }
    }

    console.log(`✓ Processed reminders: ${salesToRemindOneDayBefore.length + salesToRemindTwoHoursBefore.length} sales checked`);
  } catch (error) {
    console.error('✗ Error processing reminders:', error);
  }
};
