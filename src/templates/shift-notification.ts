/**
 * HTML email template for shift notification sent to employees
 * ADA branded with #4d6aff blue accent — DUTCH (NL)
 */

interface ShiftNotificationData {
  employeeName: string;
  restaurantName: string;
  date: string;
  startTime: string;
  endTime: string;
  position: string;
  acceptUrl: string;
  declineUrl: string;
}

export function getShiftNotificationHtml(data: ShiftNotificationData): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nieuwe Shift Toegewezen</title>
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
              <h1 style="color:#ffffff;font-size:22px;font-weight:600;margin:0;">Nieuwe Shift Toegewezen</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Hallo <strong>${data.employeeName}</strong>,
              </p>
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Er is een nieuwe shift voor je ingepland bij <strong>${data.restaurantName}</strong>. Bekijk de details hieronder en bevestig je beschikbaarheid.
              </p>

              <!-- Shift Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8f9ff;border-radius:8px;border:1px solid #e2e6ff;margin:0 0 32px;">
                <tr>
                  <td style="padding:24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;width:120px;">📅 Datum</td>
                        <td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">${data.date}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;">🕐 Uur</td>
                        <td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">${data.startTime} – ${data.endTime}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;">👤 Functie</td>
                        <td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">${data.position || 'Niet gespecificeerd'}</td>
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
                      ✅ Shift Accepteren
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${data.declineUrl}" style="display:inline-block;background-color:#ffffff;color:#e53e3e;text-decoration:none;font-size:16px;font-weight:600;padding:14px 48px;border-radius:8px;border:2px solid #e53e3e;min-width:200px;text-align:center;">
                      ❌ Shift Weigeren
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#999;font-size:13px;line-height:1.5;margin:32px 0 0;text-align:center;">
                Deze link is 3 dagen geldig. Heb je vragen? Neem dan rechtstreeks contact op met je verantwoordelijke.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:24px 40px;text-align:center;border-top:1px solid #e9ecef;">
              <p style="color:#999;font-size:12px;margin:0;">
                Powered by <strong>ADA</strong> — Planning Systeem<br/>
                © ${new Date().getFullYear()} Ada Systems. Alle rechten voorbehouden.
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
