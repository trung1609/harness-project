import nodemailer, { type Transporter } from 'nodemailer';
import type { MailSender } from './mail.service.js';
import type { SupportMailSender } from './support-mail.service.js';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/**
 * Nodemailer SMTP sender for Gmail TLS/STARTTLS delivery of activation and support emails.
 */
export class SmtpMailSender implements MailSender, SupportMailSender {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  async sendActivationEmail(to: string, activationUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Kích hoạt tài khoản Sổ tay cá nhân',
      text: `Nhấn vào liên kết sau để kích hoạt tài khoản của bạn (hết hạn sau 30 phút):\n\n${activationUrl}`,
      html: `<p>Nhấn vào liên kết sau để kích hoạt tài khoản của bạn (hết hạn sau 30 phút):</p><p><a href="${activationUrl}">Kích hoạt tài khoản</a></p>`,
    });
  }

  async sendSupportNotification(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text: body,
    });
  }
}
