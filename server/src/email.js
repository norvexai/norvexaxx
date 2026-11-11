import nodemailer from "nodemailer";
import { query } from "./db.js";

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Queue email for sending (stores in DB, processed async)
export async function queueEmail(to, subject, html, text = null) {
  await query(
    `INSERT INTO email_queue (to_email, subject, body_html, body_text)
     VALUES ($1, $2, $3, $4)`,
    [to, subject, html, text]
  );
  // Trigger async send
  processEmailQueue().catch(console.error);
}

// Process pending emails
export async function processEmailQueue() {
  try {
    const { rows } = await query(
      `SELECT id, to_email, subject, body_html, body_text, attempts
       FROM email_queue WHERE sent = false AND attempts < 3
       ORDER BY created_at LIMIT 10`
    );

    for (const email of rows) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.SMTP_USER,
          to: email.to_email,
          subject: email.subject,
          html: email.body_html,
          text: email.body_text || undefined
        });
        await query(
          `UPDATE email_queue SET sent = true, sent_at = now() WHERE id = $1`,
          [email.id]
        );
      } catch (err) {
        await query(
          `UPDATE email_queue SET attempts = attempts + 1, error = $2 WHERE id = $1`,
          [email.id, err.message]
        );
      }
    }
  } catch (err) {
    console.error("Email queue error:", err);
  }
}

// Email Templates
export function depositApprovedEmail(name, amount, currency, txid) {
  return {
    subject: `Deposit Confirmed - ${amount} ${currency}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #040E24, #0A1B3D); padding: 30px; text-align: center;">
          <h1 style="color: #4FC3F7; margin: 0;">NORVEXA INVEST GLOBAL</h1>
          <p style="color: #A9B9CE; margin: 10px 0 0;">Deposit Confirmation</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Dear ${name},</p>
          <p>Your deposit has been confirmed and credited to your account.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Amount:</strong> ${amount} ${currency}</p>
            <p style="margin: 10px 0 0;"><strong>Transaction ID:</strong> ${txid || 'N/A'}</p>
            <p style="margin: 10px 0 0;"><strong>Status:</strong> <span style="color: #5FD3A1;">Confirmed</span></p>
          </div>
          <p>You can now invest in any of our available plans.</p>
          <a href="${process.env.CLIENT_ORIGIN}/dashboard" style="display: inline-block; background: #4FC3F7; color: #031225; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">View Dashboard</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #7F93AE; font-size: 12px;">
          <p>© ${new Date().getFullYear()} NORVEXA INVEST GLOBAL. All rights reserved.</p>
        </div>
      </div>
    `
  };
}

export function withdrawalApprovedEmail(name, amount, destination) {
  return {
    subject: `Withdrawal Processed - $${amount}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #040E24, #0A1B3D); padding: 30px; text-align: center;">
          <h1 style="color: #4FC3F7; margin: 0;">NORVEXA INVEST GLOBAL</h1>
          <p style="color: #A9B9CE; margin: 10px 0 0;">Withdrawal Confirmation</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Dear ${name},</p>
          <p>Your withdrawal request has been processed.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Amount:</strong> $${amount}</p>
            <p style="margin: 10px 0 0;"><strong>Destination:</strong> ${destination}</p>
            <p style="margin: 10px 0 0;"><strong>Status:</strong> <span style="color: #5FD3A1;">Completed</span></p>
          </div>
        </div>
        <div style="padding: 20px; text-align: center; color: #7F93AE; font-size: 12px;">
          <p>© ${new Date().getFullYear()} NORVEXA INVEST GLOBAL. All rights reserved.</p>
        </div>
      </div>
    `
  };
}

export function welcomeEmail(name, email) {
  return {
    subject: "Welcome to NORVEXA INVEST GLOBAL",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #040E24, #0A1B3D); padding: 30px; text-align: center;">
          <h1 style="color: #4FC3F7; margin: 0;">NORVEXA INVEST GLOBAL</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Dear ${name},</p>
          <p>Welcome to NORVEXA INVEST GLOBAL. Your account has been successfully created.</p>
          <p>You can now:</p>
          <ul>
            <li>Complete your profile</li>
            <li>Make a deposit using Bitcoin, USDT, or Ethereum</li>
            <li>Choose from our investment plans</li>
          </ul>
          <a href="${process.env.CLIENT_ORIGIN}/dashboard" style="display: inline-block; background: #4FC3F7; color: #031225; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Access Your Account</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #7F93AE; font-size: 12px;">
          <p>© ${new Date().getFullYear()} NORVEXA INVEST GLOBAL. All rights reserved.</p>
        </div>
      </div>
    `
  };
}

export function chatNotificationEmail(customerName, message) {
  return {
    subject: `New Chat Message from ${customerName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #040E24, #0A1B3D); padding: 30px; text-align: center;">
          <h1 style="color: #4FC3F7; margin: 0;">NORVEXA INVEST GLOBAL</h1>
          <p style="color: #A9B9CE; margin: 10px 0 0;">Support Chat</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p><strong>New message from:</strong> ${customerName}</p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4FC3F7;">
            <p style="margin: 0;">${message}</p>
          </div>
          <p>Reply to this email or log in to the admin panel to respond.</p>
        </div>
      </div>
    `
  };
}
