import { Router, Request, Response } from "express";
import { staffDb } from "../lib/database-service";
import { authenticateToken, requireRestaurantAccess } from "../middleware/auth";
import { publicLimiter } from "../middleware/rate-limit";

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireRestaurantAccess());

/**
 * Calculate shift duration in hours
 */
function calcHours(startTime: string, endTime: string, breakMinutes: number): number {
  const start = new Date(`1970-01-01T${startTime}`);
  const end = new Date(`1970-01-01T${endTime}`);
  let duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (duration < 0) duration += 24; // overnight shift
  duration = Math.max(0, duration - breakMinutes / 60);
  return Math.round(duration * 100) / 100;
}

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/analytics/labor-cost:
 *   get:
 *     summary: Get labor cost analytics
 *     description: Calculate labor costs by joining shifts with employee hourly rates. Supports daily, weekly, and monthly period grouping.
 *     tags: [Analytics]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Restaurant UUID
 *       - in: query
 *         name: period
 *         required: false
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *         description: Grouping period for daily_totals
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Labor cost analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: string
 *                 start_date:
 *                   type: string
 *                 end_date:
 *                   type: string
 *                 total_cost:
 *                   type: number
 *                 total_hours:
 *                   type: number
 *                 breakdown:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       employee_id:
 *                         type: string
 *                       employee_name:
 *                         type: string
 *                       hours:
 *                         type: number
 *                       hourly_rate:
 *                         type: number
 *                       cost:
 *                         type: number
 *                 daily_totals:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                       cost:
 *                         type: number
 *                       hours:
 *                         type: number
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/labor-cost", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const period = (req.query.period as string) || "daily";
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    // Validate required params
    if (!startDate || !endDate) {
      res.status(400).json({
        error: "MISSING_REQUIRED_PARAMS",
        message: "start_date and end_date are required query parameters",
      });
      return;
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "start_date and end_date must be in YYYY-MM-DD format",
      });
      return;
    }

    // Validate period
    if (!["daily", "weekly", "monthly"].includes(period)) {
      res.status(400).json({
        error: "INVALID_PERIOD",
        message: 'period must be "daily", "weekly", or "monthly"',
      });
      return;
    }

    // Fetch labor cost data
    const { shifts } = await staffDb.getLaborCost(restaurantId, startDate, endDate);

    // Calculate per-employee breakdown
    const employeeMap = new Map<
      string,
      { employee_id: string; employee_name: string; hours: number; hourly_rate: number; cost: number }
    >();

    // Calculate per-date totals
    const dateMap = new Map<string, { cost: number; hours: number }>();

    for (const shift of shifts) {
      const hours = calcHours(shift.start_time, shift.end_time, shift.break_duration_minutes);
      const cost = Math.round(hours * shift.hourly_rate * 100) / 100;

      // Employee breakdown
      const empKey = shift.employee_id;
      const existing = employeeMap.get(empKey);
      if (existing) {
        existing.hours = Math.round((existing.hours + hours) * 100) / 100;
        existing.cost = Math.round((existing.cost + cost) * 100) / 100;
      } else {
        employeeMap.set(empKey, {
          employee_id: shift.employee_id,
          employee_name: `${shift.employee_first_name} ${shift.employee_last_name}`,
          hours,
          hourly_rate: shift.hourly_rate,
          cost,
        });
      }

      // Date totals — group key depends on period
      let groupKey: string;
      if (period === "weekly") {
        // Get the Monday of that week
        const d = new Date(shift.scheduled_date + "T00:00:00");
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        groupKey = monday.toISOString().split("T")[0];
      } else if (period === "monthly") {
        groupKey = shift.scheduled_date.substring(0, 7); // YYYY-MM
      } else {
        groupKey = shift.scheduled_date;
      }

      const existingDate = dateMap.get(groupKey);
      if (existingDate) {
        existingDate.hours = Math.round((existingDate.hours + hours) * 100) / 100;
        existingDate.cost = Math.round((existingDate.cost + cost) * 100) / 100;
      } else {
        dateMap.set(groupKey, { cost, hours });
      }
    }

    // Aggregate totals
    let totalCost = 0;
    let totalHours = 0;
    for (const emp of employeeMap.values()) {
      totalCost += emp.cost;
      totalHours += emp.hours;
    }

    // Sort breakdowns
    const breakdown = Array.from(employeeMap.values()).sort((a, b) => b.cost - a.cost);

    const dailyTotals = Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, cost: data.cost, hours: data.hours }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      period,
      start_date: startDate,
      end_date: endDate,
      total_cost: Math.round(totalCost * 100) / 100,
      total_hours: Math.round(totalHours * 100) / 100,
      breakdown,
      daily_totals: dailyTotals,
    });
  } catch (error: any) {
    console.error("Error fetching labor cost:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch labor cost analytics",
      details: error.message,
    });
  }
});

export default router;
