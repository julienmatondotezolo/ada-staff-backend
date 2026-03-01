/**
 * HTML email template for shift notification sent to employees
 * ADA branded with #4d6aff blue accent
 */

interface ShiftNotificationData {
  employeeName: string;
  restaurantName: string;
  date: string; // formatted date string e.g. "Monday, March 3, 2026"
  startTime: string;
  endTime: string;
  position: string;
  acceptUrl: string;
  declineUrl: string;
}

export function getShiftNotificationHtml(data: ShiftNotificationData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Shift Assignment</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f5f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#4d6aff;padding:32px 40px;text-align:center;">
              <img src="https://dxxtxdyrovawugvvrhah.supabase.co/storage/v1/object/public/ada/LOGO-ADA.png" alt="ADA" width="100" style="display:block;margin:0 auto 16px;" />
              <h1 style="color:#ffffff;font-size:22px;font-weight:600;margin:0;">New Shift Assignment</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Hi <strong>${data.employeeName}</strong>,
              </p>
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px;">
                You have been assigned a new shift at <strong>${data.restaurantName}</strong>. Please review the details below and confirm your availability.
              </p>

              <!-- Shift Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8f9ff;border-radius:8px;border:1px solid #e2e6ff;margin:0 0 32px;">
                <tr>
                  <td style="padding:24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;width:120px;">📅 Date</td>
                        <td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">${data.date}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;">🕐 Time</td>
                        <td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">${data.startTime} – ${data.endTime}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;">👤 Position</td>
                        <td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">${data.position}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;">🏢 Restaurant</td>
                        <td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">${data.restaurantName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Action Buttons -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:0 0 16px;">
                    <a href="${data.acceptUrl}" style="display:inline-block;background-color:#4d6aff;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 48px;border-radius:8px;min-width:200px;text-align:center;">
                      ✅ Accept Shift
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${data.declineUrl}" style="display:inline-block;background-color:#ffffff;color:#e53e3e;text-decoration:none;font-size:16px;font-weight:600;padding:14px 48px;border-radius:8px;border:2px solid #e53e3e;min-width:200px;text-align:center;">
                      ❌ Decline Shift
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#999;font-size:13px;line-height:1.5;margin:32px 0 0;text-align:center;">
                This link expires in 3 days. If you have questions, please contact your manager directly.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:24px 40px;text-align:center;border-top:1px solid #e9ecef;">
              <p style="color:#999;font-size:12px;margin:0;">
                Powered by <strong>ADA</strong> — Staff Planning System<br/>
                © ${new Date().getFullYear()} Ada Systems. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
