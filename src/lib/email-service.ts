import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "re_J4fPsHN2_4Jig8Dm6yCBfZpGkDQtHheQ9");

const FROM_EMAIL = "ADA Staff <noreply@adasystems.app>";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email via Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error("[Email] Failed to send:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Sent successfully to ${options.to}, id: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Email] Error sending email:", err);
    return { success: false, error: err.message };
  }
}
