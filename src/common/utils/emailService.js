import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

if (!resend) {
  console.warn(
    "⚠️  RESEND_API_KEY not set. Emails will not be sent — " +
    "invite links will be logged to console instead."
  );
} else {
  console.log("✅ Resend email service initialized");
}

const getFromAddress = () =>
  process.env.EMAIL_FROM_ADDRESS || "onboarding@resend.dev";

const getFromName = () => process.env.EMAIL_FROM_NAME || "Beno PDR";

/**
 * Send invite email to a new team member
 */
export const sendInviteEmail = async ({
  toEmail,
  toName,
  inviterName,
  inviterEmail,
  companyName,
  role,
  inviteLink,
}) => {
  if (!resend) {
    console.warn(
      `Email not configured. Invite link for ${toEmail}: ${inviteLink}`
    );
    return { sent: false, reason: "Email service not configured" };
  }

  const fromAddress = getFromAddress();
  const fromName = getFromName();

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
      <div style="width: 48px; height: 48px; background: #0d9488; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
        <span style="color: white; font-weight: bold; font-size: 20px; line-height: 48px; text-align: center; display: block;">B</span>
      </div>

      <h2 style="color: #111827; margin-bottom: 8px; font-size: 20px;">
        You're invited to join ${companyName}
      </h2>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        <strong>${inviterName}</strong> (${inviterEmail}) has invited
        you to join <strong>${companyName}</strong> on Beno PDR as a
        <strong style="color: #0d9488; text-transform: capitalize;">${role}</strong>.
      </p>

      <a href="${inviteLink}"
         style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; margin: 24px 0;">
        Accept Invitation
      </a>

      <p style="color: #9ca3af; font-size: 12px; line-height: 1.5;">
        This invite link will expire in 7 days. If you weren't
        expecting this invite, you can safely ignore this email.
      </p>

      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px; word-break: break-all;">
        Or copy this link: ${inviteLink}
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #d1d5db; font-size: 11px;">
        Sent via Beno PDR — Prospect Data Research Platform
      </p>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: toEmail,
      replyTo: inviterEmail,
      subject: `You're invited to join ${companyName} on Beno PDR`,
      html,
    });

    if (error) {
      console.error(`❌ Resend error for ${toEmail}:`, error);
      return { sent: false, reason: error.message || "Unknown error" };
    }

    console.log(`✅ Invite email sent to ${toEmail} (id: ${data?.id})`);
    return { sent: true, id: data?.id };
  } catch (error) {
    console.error(`❌ Failed to send invite email to ${toEmail}:`, error.message);
    return { sent: false, reason: error.message };
  }
};

/**
 * Send welcome email after invite accepted (optional, fire-and-forget)
 */
export const sendWelcomeEmail = async ({ toEmail, toName, companyName }) => {
  if (!resend) return { sent: false };

  const fromAddress = getFromAddress();
  const fromName = getFromName();

  try {
    await resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: toEmail,
      subject: `Welcome to ${companyName} on Beno PDR`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #111827;">Welcome aboard, ${toName}!</h2>
          <p style="color: #6b7280; font-size: 14px;">
            You're now part of ${companyName}'s workspace on Beno PDR.
            Start exploring prospects, ICPs, and campaigns.
          </p>
        </div>
      `,
    });
    return { sent: true };
  } catch (error) {
    console.error("Welcome email failed:", error.message);
    return { sent: false, reason: error.message };
  }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async ({ to, resetURL, userName }) => {
  if (!resend) {
    console.warn(`Email not configured. Reset link for ${to}: ${resetURL}`);
    const error = new Error("Email service not configured");
    throw error;
  }

  const fromAddress = getFromAddress();
  const fromName = getFromName();

  const html = `
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
  `;

  const { data, error } = await resend.emails.send({
    from: `${fromName} <${fromAddress}>`,
    to,
    subject: "Password Reset Request — Beno PDR Tool",
    html,
  });

  if (error) {
    console.error(`❌ Resend error for ${to}:`, error);
    throw new Error(error.message || "Failed to send password reset email");
  }

  console.log(`✅ Password reset email sent to ${to} (id: ${data?.id})`);
};
