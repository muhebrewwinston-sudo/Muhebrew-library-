const nodemailer = require('nodemailer');

// Support standard SMTP configuration
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const SMTP_FROM = process.env.SMTP_FROM || (SMTP_USER ? `"Muhebrew Library" <${SMTP_USER}>` : '"Muhebrew Library" <noreply@muhebrew.com>');

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
    console.log('[Email] Configured SMTP transporter with host:', SMTP_HOST);
  } catch (err) {
    console.error('[Email] Failed to create SMTP transporter:', err.message);
  }
}

async function sendEmail({ to, subject, html, text }) {
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject,
        text,
        html
      });
      console.log(`[Email] Sent email to ${to}: ${subject} (ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[Email] Error sending email to ${to}:`, err.message);
      // Fallback: don't crash, still allow user to proceed
      return { success: false, error: err.message, simulated: true };
    }
  }

  // Fallback when SMTP is not yet configured: log clearly to server console
  console.log(`\n======================================================`);
  console.log(`[Email Service (Simulated - No SMTP Configured)]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Message:\n${text}`);
  console.log(`======================================================\n`);
  return { success: true, simulated: true };
}

async function sendVerificationCode(email, name, code) {
  const subject = `Your Muhebrew Library Verification Code: ${code}`;
  const text = `Hello ${name || 'there'},\n\nYour verification code for Muhebrew Library is: ${code}\n\nThis code will expire in 15 minutes.\n\nBest regards,\nMuhebrew Library Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #cfe3d7; border-radius: 14px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1b7f4b; font-size: 24px; font-weight: 800;">Muhebrew Library</h2>
        <p style="margin: 4px 0 0; color: #5d7a6c; font-size: 13px;">Malawi secondary school educational resources</p>
      </div>
      <div style="background: #f4faf6; border: 1px solid #d1ebd9; border-radius: 12px; padding: 20px; text-align: center;">
        <p style="margin: 0 0 10px; color: #0f2e22; font-size: 15px; font-weight: 600;">Hello ${name ? name.split(' ')[0] : 'there'},</p>
        <p style="margin: 0 0 16px; color: #4b6b5b; font-size: 14px;">Please use the following 6-digit verification code to complete your registration:</p>
        <div style="display: inline-block; background: #1b7f4b; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 12px 28px; border-radius: 10px; margin: 8px 0 16px; box-shadow: 0 4px 14px rgba(27, 127, 75, 0.28);">
          ${code}
        </div>
        <p style="margin: 0; color: #5d7a6c; font-size: 12px;">This code will expire in <b>15 minutes</b>.</p>
      </div>
      <p style="margin: 20px 0 0; color: #8fa89b; font-size: 12px; text-align: center;">
        If you did not request this account, please ignore this email.
      </p>
    </div>
  `;
  return sendEmail({ to: email, subject, text, html });
}

async function sendPasswordResetCode(email, name, code) {
  const subject = `Muhebrew Library: Password Reset Code: ${code}`;
  const text = `Hello ${name || 'there'},\n\nYour password reset code is: ${code}\n\nThis code will expire in 15 minutes.\n\nIf you did not request a password reset, please ignore this email.\n\nMuhebrew Library Team`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #cfe3d7; border-radius: 14px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1b7f4b; font-size: 24px; font-weight: 800;">Muhebrew Library</h2>
        <p style="margin: 4px 0 0; color: #5d7a6c; font-size: 13px;">Password Reset Request</p>
      </div>
      <div style="background: #fdf5f5; border: 1px solid #fed7d7; border-radius: 12px; padding: 20px; text-align: center;">
        <p style="margin: 0 0 10px; color: #0f2e22; font-size: 15px; font-weight: 600;">Hello ${name ? name.split(' ')[0] : 'there'},</p>
        <p style="margin: 0 0 16px; color: #4b6b5b; font-size: 14px;">We received a request to reset your password. Use this 6-digit code:</p>
        <div style="display: inline-block; background: #dc2626; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 12px 28px; border-radius: 10px; margin: 8px 0 16px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.28);">
          ${code}
        </div>
        <p style="margin: 0; color: #5d7a6c; font-size: 12px;">This code will expire in <b>15 minutes</b>.</p>
      </div>
      <p style="margin: 20px 0 0; color: #8fa89b; font-size: 12px; text-align: center;">
        If you did not request a password reset, please secure your account or ignore this message.
      </p>
    </div>
  `;
  return sendEmail({ to: email, subject, text, html });
}

module.exports = {
  sendEmail,
  sendVerificationCode,
  sendPasswordResetCode
};
