import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { staffDb } from "../lib/database-service";
import { sendEmail } from "../lib/email-service";
import { getShiftResponseConfirmationHtml } from "../templates/shift-response-confirmation";

const router = Router({ mergeParams: true });

// Aggressive rate limiter for shift response endpoints: 5 req/min per IP
const shiftResponseLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  keyGenerator: (req: Request) => {
    const forwarded = req.headers["x-forwarded-for"] as string;
    const realIp = req.headers["x-real-ip"] as string;
    if (forwarded && typeof forwarded === "string") {
      const firstIp = forwarded.split(",")[0].trim();
      if (firstIp && firstIp !== "undefined") return firstIp;
    }
    if (realIp && typeof realIp === "string" && realIp !== "undefined") return realIp;
    return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || "unknown";
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again in a minute.",
    });
  },
});

/**
 * Format a date string nicely
 */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("nl-BE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format time string (HH:MM:SS -> HH:MM)
 */
function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

/**
 * @swagger
 * /api/v1/shift-response/{token}:
 *   get:
 *     summary: Get shift details by response token
 *     description: Public endpoint. Validates token, checks expiry, returns shift details and employee name. If already responded, returns the action taken.
 *     tags: [Shift Responses]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Shift response token
 *     responses:
 *       200:
 *         description: Shift details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 shift:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     date:
 *                       type: string
 *                     start_time:
 *                       type: string
 *                     end_time:
 *                       type: string
 *                     position:
 *                       type: string
 *                     status:
 *                       type: string
 *                 employee_name:
 *                   type: string
 *                 already_responded:
 *                   type: boolean
 *                 action:
 *                   type: string
 *                   nullable: true
 *                 expired:
 *                   type: boolean
 *       404:
 *         description: Token not found
 *       410:
 *         description: Token expired
 */
router.get("/:token", shiftResponseLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    const tokenData = await staffDb.getShiftResponseToken(token);

    if (!tokenData) {
      res.status(404).json({
        error: "TOKEN_NOT_FOUND",
        message: "Invalid or unknown shift response token",
      });
      return;
    }

    const isExpired = new Date(tokenData.expires_at) < new Date();
    const alreadyResponded = tokenData.action !== null;

    // Get restaurant name
    const restaurantName = await staffDb.getRestaurantName(tokenData.restaurant_id);

    // Get ALL shifts for this employee in the same week (±6 days from the token's shift date)
    const shiftDate = new Date(tokenData.shift.scheduled_date + "T00:00:00");
    const weekStart = new Date(shiftDate);
    weekStart.setDate(shiftDate.getDate() - shiftDate.getDay() + (shiftDate.getDay() === 0 ? -6 : 1)); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday

    const startStr = weekStart.toISOString().split("T")[0];
    const endStr = weekEnd.toISOString().split("T")[0];

    let weeklyShifts: any[] = [];
    try {
      const allShifts = await staffDb.getShifts(tokenData.restaurant_id, startStr, endStr, tokenData.employee.id);
      weeklyShifts = (allShifts || [])
        .sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date))
        .map((s: any) => ({
          id: s.id,
          date: s.scheduled_date,
          start_time: formatTime(s.start_time),
          end_time: formatTime(s.end_time),
          position: s.position,
          status: s.status,
        }));
    } catch (err) {
      console.error("[shift-response] Failed to get weekly shifts:", err);
      // Fallback to single shift
      weeklyShifts = [{
        id: tokenData.shift.id,
        date: tokenData.shift.scheduled_date,
        start_time: formatTime(tokenData.shift.start_time),
        end_time: formatTime(tokenData.shift.end_time),
        position: tokenData.shift.position,
        status: tokenData.shift.status,
      }];
    }

    res.json({
      shift: {
        id: tokenData.shift.id,
        date: tokenData.shift.scheduled_date,
        date_formatted: formatDate(tokenData.shift.scheduled_date),
        start_time: formatTime(tokenData.shift.start_time),
        end_time: formatTime(tokenData.shift.end_time),
        position: tokenData.shift.position,
        status: tokenData.shift.status,
      },
      weekly_shifts: weeklyShifts,
      employee_name: `${tokenData.employee.first_name} ${tokenData.employee.last_name}`,
      restaurant_name: restaurantName,
      already_responded: alreadyResponded,
      action: tokenData.action,
      responded_at: tokenData.responded_at,
      expired: isExpired,
    });
  } catch (error: any) {
    console.error("Error fetching shift response:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch shift response details",
    });
  }
});

/**
 * @swagger
 * /api/v1/shift-response/{token}:
 *   post:
 *     summary: Respond to a shift assignment
 *     description: Public endpoint. Accept or decline a shift. Updates shift status, creates notification, sends confirmation email to manager.
 *     tags: [Shift Responses]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Shift response token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [accepted, declined]
 *     responses:
 *       200:
 *         description: Response recorded successfully
 *       400:
 *         description: Invalid action or already responded
 *       404:
 *         description: Token not found
 *       410:
 *         description: Token expired
 */
router.post("/:token", shiftResponseLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { action } = req.body;

    // Validate action
    if (!action || !["accepted", "declined"].includes(action)) {
      res.status(400).json({
        error: "INVALID_ACTION",
        message: 'action must be "accepted" or "declined"',
      });
      return;
    }

    // Fetch token data
    const tokenData = await staffDb.getShiftResponseToken(token);

    if (!tokenData) {
      res.status(404).json({
        error: "TOKEN_NOT_FOUND",
        message: "Invalid or unknown shift response token",
      });
      return;
    }

    // Check expiry
    if (new Date(tokenData.expires_at) < new Date()) {
      res.status(410).json({
        error: "TOKEN_EXPIRED",
        message: "This shift response link has expired. Please contact your manager.",
      });
      return;
    }

    // Check if already responded
    if (tokenData.action !== null) {
      res.status(400).json({
        error: "ALREADY_RESPONDED",
        message: `You have already ${tokenData.action} this shift.`,
        action: tokenData.action,
        responded_at: tokenData.responded_at,
      });
      return;
    }

    // Update token with response
    await staffDb.updateShiftResponseToken(token, action);

    // Update ALL shifts for this employee in the same week (not just the token's shift)
    const newShiftStatus = action === "accepted" ? "confirmed" : "declined";
    const shiftDate = new Date(tokenData.shift.scheduled_date + "T00:00:00");
    const weekStart = new Date(shiftDate);
    weekStart.setDate(shiftDate.getDate() - shiftDate.getDay() + (shiftDate.getDay() === 0 ? -6 : 1));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const startStr = weekStart.toISOString().split("T")[0];
    const endStr = weekEnd.toISOString().split("T")[0];

    let allEmployeeShifts: any[] = [];
    try {
      allEmployeeShifts = await staffDb.getShifts(tokenData.restaurant_id, startStr, endStr, tokenData.employee.id);
    } catch {
      allEmployeeShifts = [{ id: tokenData.shift.id }];
    }

    for (const shift of allEmployeeShifts) {
      try {
        await staffDb.updateShift(shift.id, tokenData.restaurant_id, {
          status: newShiftStatus as any,
        });
      } catch (err: any) {
        if (err.message?.includes('check') || err.message?.includes('constraint') || err.message?.includes('violates')) {
          console.warn(`[shift-response] 'declined' status rejected by DB for shift ${shift.id}, falling back to 'cancelled'`);
          await staffDb.updateShift(shift.id, tokenData.restaurant_id, {
            status: 'cancelled' as any,
          });
        } else {
          throw err;
        }
      }
    }

    // Get restaurant name
    const restaurantName = await staffDb.getRestaurantName(tokenData.restaurant_id);
    const employeeName = `${tokenData.employee.first_name} ${tokenData.employee.last_name}`;

    // Create notification for restaurant managers
    const notificationType = action === "accepted" ? "shift_accepted" : "shift_declined";
    const notificationTitle =
      action === "accepted"
        ? `${employeeName} heeft de shift geaccepteerd`
        : `${employeeName} heeft de shift geweigerd`;

    const managers = await staffDb.getRestaurantManagers(tokenData.restaurant_id);

    // Create notification for each manager
    for (const manager of managers) {
      await staffDb.createNotification({
        restaurant_id: tokenData.restaurant_id,
        recipient_user_id: manager.user_id,
        type: notificationType,
        title: notificationTitle,
        message: `${employeeName} heeft de shift op ${formatDate(tokenData.shift.scheduled_date)} (${formatTime(tokenData.shift.start_time)} - ${formatTime(tokenData.shift.end_time)}) als ${tokenData.shift.position} ${action === 'accepted' ? 'geaccepteerd' : 'geweigerd'}.`,
        metadata: {
          shift_id: tokenData.shift.id,
          employee_id: tokenData.employee.id,
          employee_name: employeeName,
          date: tokenData.shift.scheduled_date,
          start_time: tokenData.shift.start_time,
          end_time: tokenData.shift.end_time,
          position: tokenData.shift.position,
          action,
        },
      });

      // Send confirmation email to manager
      if (manager.email) {
        const html = getShiftResponseConfirmationHtml({
          managerName: (manager as any).full_name || "Manager",
          employeeName,
          action,
          restaurantName,
          date: formatDate(tokenData.shift.scheduled_date),
          startTime: formatTime(tokenData.shift.start_time),
          endTime: formatTime(tokenData.shift.end_time),
          position: tokenData.shift.position,
        });

        // Fire and forget — don't block the response
        sendEmail({
          to: manager.email,
          subject: `Shift ${action === 'accepted' ? 'geaccepteerd' : 'geweigerd'}: ${employeeName} — ${formatDate(tokenData.shift.scheduled_date)}`,
          html,
        }).catch((err) => console.error("[ShiftResponse] Failed to send manager email:", err));
      }
    }

    res.json({
      success: true,
      message:
        action === "accepted"
          ? "Shift geaccepteerd! Je verantwoordelijke is op de hoogte gebracht."
          : "Shift geweigerd. Je verantwoordelijke is op de hoogte gebracht.",
      action,
      shift_status: newShiftStatus,
    });
  } catch (error: any) {
    console.error("Error processing shift response:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to process shift response",
    });
  }
});

export default router;
