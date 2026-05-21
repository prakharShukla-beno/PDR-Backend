import nodemailer from "nodemailer";

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password — not normal password
    },
  });
};

export const sendPasswordResetEmail = async ({ to, resetURL, userName }) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Beno PDR Tool" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Password Reset Request — Beno PDR Tool",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">

        <div style="background: #1B2F5C; padding: 24px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <div style="display: inline-flex; align-items: center; gap: 10px;">
            <div style="background: white; color: #1B2F5C; width: 36px; height: 36px; border-radius: 8px;
                        display: inline-flex; align-items: center; justify-content: center;
                        font-weight: bold; font-size: 18px; line-height: 36px;">B</div>
            <span style="color: white; font-size: 20px; font-weight: 600;">Beno PDR Tool</span>
          </div>
        </div>

        <div style="background: #f9fafb; padding: 32px 28px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
          <h2 style="color: #111827; margin: 0 0 8px;">Password Reset Request</h2>

          <p style="color: #4b5563; margin: 0 0 8px;">Hi <strong>${userName}</strong>,</p>
          <p style="color: #4b5563; margin: 0 0 24px;">
            We received a request to reset your Beno PDR Tool password.
            Click the button below — this link is valid for <strong>15 minutes</strong>.
          </p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetURL}"
               style="background: #1B2F5C; color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 6px; font-weight: 600;
                      font-size: 15px; display: inline-block;">
              Reset My Password
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px;">
            If you did not request this, ignore this email — your password will not change.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />

          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Button not working? Copy this link:<br/>
            <a href="${resetURL}" style="color: #1B2F5C; word-break: break-all;">${resetURL}</a>
          </p>
        </div>
      </div>
    `,
  });
};