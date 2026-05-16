import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // TLS via STARTTLS
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const emailService = {
  emails: {
    send: async (options: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      replyTo?: string;
    }) => {
      return transporter.sendMail({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        replyTo: options.replyTo,
      });
    },
  },
};
