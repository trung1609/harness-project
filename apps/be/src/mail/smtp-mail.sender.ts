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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function wrapEmailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;background-color:#ffffff;">
                <span style="display:inline-block;padding:4px 10px;border-radius:6px;background-color:#eff6ff;color:#2563eb;font-size:12px;font-weight:600;letter-spacing:0.02em;">SỔ TAY CÁ NHÂN</span>
                <h1 style="margin:12px 0 0;font-size:20px;line-height:1.35;font-weight:600;color:#0f172a;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;font-size:14px;line-height:1.65;color:#334155;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
                Email này được gửi tự động từ hệ thống Sổ tay cá nhân. Vui lòng không chia sẻ liên kết xác thực cho người khác.
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
    const safeUrl = escapeHtml(activationUrl);
    const html = wrapEmailLayout(
      'Xác nhận kích hoạt tài khoản',
      `<p style="margin:0 0 14px;">Xin chào,</p>
       <p style="margin:0 0 20px;">Cảm ơn bạn đã đăng ký <strong>Sổ tay cá nhân</strong>. Nhấn nút bên dưới để hoàn tất kích hoạt tài khoản của bạn:</p>
       <p style="margin:0 0 22px;">
         <a href="${safeUrl}" style="display:inline-block;padding:11px 22px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">Kích hoạt tài khoản</a>
       </p>
       <p style="margin:0 0 12px;font-size:13px;color:#475569;">Liên kết này chỉ sử dụng một lần và sẽ hết hạn sau <strong>30 phút</strong>.</p>
       <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all;">Nếu nút trên không hoạt động, hãy sao chép đường dẫn sau vào trình duyệt:<br/><a href="${safeUrl}" style="color:#2563eb;">${safeUrl}</a></p>`,
    );

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: '[Sổ tay cá nhân] Kích hoạt tài khoản của bạn',
      text: `Xin chào,\n\nCảm ơn bạn đã đăng ký Sổ tay cá nhân.\nVui lòng mở liên kết sau để kích hoạt tài khoản (dùng một lần, hết hạn sau 30 phút):\n\n${activationUrl}\n\nNếu bạn không thực hiện yêu cầu này, có thể bỏ qua email.`,
      html,
    });
  }

  async sendSupportNotification(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const html = wrapEmailLayout(
      subject,
      `<p style="margin:0 0 14px;">Xin chào,</p>
       <p style="margin:0 0 14px;">Hệ thống vừa cập nhật trạng thái xử lý yêu cầu của bạn:</p>
       <div style="padding:12px 16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a;font-size:13px;">${escapeHtml(body)}</div>`,
    );

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `[Sổ tay cá nhân] ${subject}`,
      text: body,
      html,
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const safeUrl = escapeHtml(resetUrl);
    const html = wrapEmailLayout(
      'Đặt lại mật khẩu',
      `<p style="margin:0 0 14px;">Xin chào,</p>
       <p style="margin:0 0 20px;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>Sổ tay cá nhân</strong> của bạn. Nhấn nút bên dưới để tạo mật khẩu mới:</p>
       <p style="margin:0 0 22px;">
         <a href="${safeUrl}" style="display:inline-block;padding:11px 22px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">Cập nhật mật khẩu mới</a>
       </p>
       <p style="margin:0 0 12px;font-size:13px;color:#475569;">Liên kết này chỉ sử dụng một lần và sẽ hết hạn sau <strong>30 phút</strong>.</p>
       <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all;">Nếu nút trên không hoạt động, hãy sao chép đường dẫn sau:<br/><a href="${safeUrl}" style="color:#2563eb;">${safeUrl}</a></p>`,
    );

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: '[Sổ tay cá nhân] Đặt lại mật khẩu tài khoản',
      text: `Xin chào,\n\nVui lòng mở liên kết sau để đặt lại mật khẩu (dùng một lần, hết hạn sau 30 phút):\n\n${resetUrl}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
      html,
    });
  }

  async sendUnlockVerificationEmail(
    to: string,
    unlockUrl: string,
  ): Promise<void> {
    const safeUrl = escapeHtml(unlockUrl);
    const html = wrapEmailLayout(
      'Xác minh yêu cầu mở khóa tài khoản',
      `<p style="margin:0 0 14px;">Xin chào,</p>
       <p style="margin:0 0 20px;">Tài khoản của bạn hiện đang bị khóa. Nhấn nút bên dưới để xác minh email và gửi yêu cầu mở khóa tới quản trị viên:</p>
       <p style="margin:0 0 22px;">
         <a href="${safeUrl}" style="display:inline-block;padding:11px 22px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">Gửi yêu cầu mở khóa</a>
       </p>
       <p style="margin:0 0 12px;font-size:13px;color:#475569;">Liên kết này chỉ sử dụng một lần và sẽ hết hạn sau <strong>30 phút</strong>.</p>
       <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all;">Đường dẫn trực tiếp:<br/><a href="${safeUrl}" style="color:#2563eb;">${safeUrl}</a></p>`,
    );

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: '[Sổ tay cá nhân] Xác minh mở khóa tài khoản',
      text: `Xin chào,\n\nMở liên kết sau để xác minh email và gửi yêu cầu mở khóa tài khoản (hết hạn sau 30 phút):\n\n${unlockUrl}`,
      html,
    });
  }
}
