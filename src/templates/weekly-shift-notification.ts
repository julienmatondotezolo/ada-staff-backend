/**
 * HTML email template for weekly shift notification sent to employees
 * Shows ALL shifts for the week — DUTCH (NL)
 */

interface ShiftEntry {
  date: string; // formatted date
  startTime: string;
  endTime: string;
  position: string;
}

interface WeeklyShiftNotificationData {
  employeeName: string;
  restaurantName: string;
  weekLabel: string; // e.g. "3 maart – 9 maart 2026"
  shifts: ShiftEntry[];
  responseUrl: string; // single URL for accept/decline all
}

export function getWeeklyShiftNotificationHtml(data: WeeklyShiftNotificationData): string {
  const shiftRows = data.shifts.map(s => `
    <tr>
      <td style="padding:10px 12px;color:#333;font-size:14px;font-weight:600;border-bottom:1px solid #eef0ff;">${s.date}</td>
      <td style="padding:10px 12px;color:#333;font-size:14px;border-bottom:1px solid #eef0ff;">${s.startTime} – ${s.endTime}</td>
      <td style="padding:10px 12px;color:#333;font-size:14px;border-bottom:1px solid #eef0ff;">${s.position || 'Niet gespecificeerd'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jouw Werkrooster</title>
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
              <h1 style="color:#ffffff;font-size:22px;font-weight:600;margin:0;">Jouw Werkrooster</h1>
              <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">${data.weekLabel}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Hallo <strong>${data.employeeName}</strong>,
              </p>
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Hieronder vind je jouw planning voor de komende week bij <strong>${data.restaurantName}</strong>. Gelieve je beschikbaarheid te bevestigen.
              </p>

              <!-- Shifts Table -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8f9ff;border-radius:8px;border:1px solid #e2e6ff;margin:0 0 32px;border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 12px;color:#666;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e6ff;">📅 Dag</td>
                  <td style="padding:10px 12px;color:#666;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e6ff;">🕐 Uur</td>
                  <td style="padding:10px 12px;color:#666;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e6ff;">👤 Functie</td>
                </tr>
                ${shiftRows}
              </table>

              <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 32px;text-align:center;">
                <strong>${data.shifts.length} shift${data.shifts.length > 1 ? 's' : ''}</strong> deze week
              </p>

              <!-- Action Buttons -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:0 0 16px;">
                    <a href="${data.responseUrl}" style="display:inline-block;background-color:#4d6aff;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 48px;border-radius:8px;min-width:200px;text-align:center;">
                      ✅ Bevestigen
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#999;font-size:13px;line-height:1.5;margin:24px 0 0;text-align:center;">
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
