/**
 * HTML email template for manager confirmation when employee responds to a shift
 * ADA branded with #4d6aff blue accent — DUTCH (NL)
 */

interface ShiftResponseConfirmationData {
  managerName: string;
  employeeName: string;
  action: 'accepted' | 'declined';
  restaurantName: string;
  date: string;
  startTime: string;
  endTime: string;
  position: string;
}

export function getShiftResponseConfirmationHtml(data: ShiftResponseConfirmationData): string {
  const isAccepted = data.action === 'accepted';
  const statusColor = isAccepted ? '#38a169' : '#e53e3e';
  const statusEmoji = isAccepted ? '✅' : '❌';
  const statusText = isAccepted ? 'Geaccepteerd' : 'Geweigerd';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shift Reactie - ${statusText}</title>
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
              <h1 style="color:#ffffff;font-size:22px;font-weight:600;margin:0;">Shift Reactie Update</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Hallo <strong>${data.managerName}</strong>,
              </p>

              <!-- Status Badge -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center">
                    <span style="display:inline-block;background-color:${statusColor};color:#ffffff;font-size:18px;font-weight:600;padding:12px 32px;border-radius:8px;">
                      ${statusEmoji} ${data.employeeName} heeft de shift ${isAccepted ? 'geaccepteerd' : 'geweigerd'}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Shift Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8f9ff;border-radius:8px;border:1px solid #e2e6ff;margin:0 0 32px;">
                <tr>
                  <td style="padding:24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;width:120px;">👤 Medewerker</td>
                        <td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">${data.employeeName}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;">📅 Datum</td>
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
                      <tr>
                        <td style="padding:6px 0;color:#666;font-size:14px;">📋 Status</td>
                        <td style="padding:6px 0;font-size:14px;font-weight:600;color:${statusColor};">${statusText}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color:#666;font-size:14px;line-height:1.6;margin:0;">
                ${isAccepted
                  ? 'De shift is bevestigd. Er is geen verdere actie nodig.'
                  : 'Je moet mogelijk een vervanger zoeken of deze shift opnieuw toewijzen.'}
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
