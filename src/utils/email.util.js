const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const mailClient = getTransporter();

  if (!mailClient) {
    console.log(`\n================== [SIMULATED EMAIL] ==================`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${text || html}`);
    console.log(`=======================================================\n`);
    return { success: true, simulated: true };
  }

  try {
    const info = await mailClient.sendMail({
      from: `"HCM Lite System" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: text || subject,
      html
    });
    console.log(`[Email Sent] Message ID: ${info.messageId} to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email Error] Failed to send email to ${to}: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const sendWelcomeEmail = async ({ to, name, temporaryPassword, role }) => {
  const subject = 'Welcome to HCM Lite — Your Account Login Details';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #0f766e;">Welcome to HCM Lite, ${name}!</h2>
      <p>An account has been created for you with the role of <strong>${role}</strong>.</p>
      <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Email:</strong> ${to}</p>
        <p style="margin: 5px 0 0 0;"><strong>Temporary Password:</strong> <code style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">${temporaryPassword}</code></p>
      </div>
      <p style="color: #b45309; font-weight: bold;">Important: You must change your password upon your first sign in.</p>
      <p>Best regards,<br/>HR & Operations Team</p>
    </div>
  `;
  return sendEmail({ to, subject, html, text: `Welcome ${name}! Your temp password is ${temporaryPassword}. Please change it upon first login.` });
};

const sendOtpEmail = async ({ to, name, otp }) => {
  const subject = 'Password Reset OTP — HCM Lite';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #0f766e;">Password Reset Request</h2>
      <p>Hello ${name || 'User'},</p>
      <p>You requested to reset your password. Use the following code to proceed:</p>
      <h1 style="color: #2563eb; letter-spacing: 4px; background: #eff6ff; display: inline-block; padding: 8px 16px; border-radius: 6px;">${otp}</h1>
      <p>This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
    </div>
  `;
  return sendEmail({ to, subject, html, text: `Your password reset code is: ${otp}. Valid for 15 minutes.` });
};

const sendLeaveDecisionEmail = async ({ to, name, leaveType, startDate, endDate, status, comment }) => {
  const isApproved = status === 'APPROVED';
  const subject = `Leave Request ${status} — HCM Lite`;
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: ${isApproved ? '#15803d' : '#b91c1c'};">Leave Request ${status}</h2>
      <p>Hello ${name},</p>
      <p>Your <strong>${leaveType}</strong> leave request from <strong>${startDate}</strong> to <strong>${endDate}</strong> has been <strong>${status}</strong>.</p>
      ${comment ? `<p><strong>HR Comment:</strong> ${comment}</p>` : ''}
    </div>
  `;
  return sendEmail({ to, subject, html, text: `Your leave request for ${startDate} to ${endDate} has been ${status}.` });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendOtpEmail,
  sendLeaveDecisionEmail
};
