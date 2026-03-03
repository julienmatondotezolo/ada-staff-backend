import { Router, Request, Response } from "express";
import crypto from "crypto";
import { staffDb } from "../lib/database-service";
import { authenticateToken, requireRestaurantAccess, requireStaffManagement } from "../middleware/auth";
import { publicLimiter, adminLimiter } from "../middleware/rate-limit";
import { sendEmail } from "../lib/email-service";
import { getShiftNotificationHtml } from "../templates/shift-notification";
import { getWeeklyShiftNotificationHtml } from "../templates/weekly-shift-notification";

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireRestaurantAccess());

const BASE_URL = process.env.BASE_URL || "https://adastaff.mindgen.app";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ada-planning.vercel.app";

/**
 * Send shift notification email and create token + notification
 * Used by both single and bulk shift creation
 */
async function sendShiftNotification(
  shiftId: string,
  employeeId: string,
  restaurantId: string,
  employee: { first_name: string; last_name: string; email?: string; position: string },
  shiftDetails: { scheduled_date: string; start_time: string; end_time: string; position: string },
  createdBy: string
): Promise<void> {
  try {
    const restaurantName = await staffDb.getRestaurantName(restaurantId);
    const employeeName = `${employee.first_name} ${employee.last_name}`;

    // Format date
    let dateFormatted: string;
    try {
      const d = new Date(shiftDetails.scheduled_date + "T00:00:00");
      dateFormatted = d.toLocaleDateString("nl-BE", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      dateFormatted = shiftDetails.scheduled_date;
    }

    const startTime = shiftDetails.start_time.substring(0, 5);
    const endTime = shiftDetails.end_time.substring(0, 5);

    // Create shift_pending notification
    const managers = await staffDb.getRestaurantManagers(restaurantId);
    for (const manager of managers) {
      await staffDb.createNotification({
        restaurant_id: restaurantId,
        recipient_user_id: manager.user_id,
        type: "shift_pending",
        title: `Shift toegewezen aan ${employeeName}`,
        message: `${employeeName} heeft een shift op ${dateFormatted} (${startTime} - ${endTime}) als ${shiftDetails.position}. Wacht op reactie.`,
        metadata: {
          shift_id: shiftId,
          employee_id: employeeId,
          employee_name: employeeName,
          date: shiftDetails.scheduled_date,
          start_time: shiftDetails.start_time,
          end_time: shiftDetails.end_time,
          position: shiftDetails.position,
        },
      });
    }

    // If employee has an email, generate token and send notification
    if (employee.email) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days

      await staffDb.createShiftResponseToken({
        shift_id: shiftId,
        employee_id: employeeId,
        restaurant_id: restaurantId,
        token,
        expires_at: expiresAt,
      });

      const acceptUrl = `${FRONTEND_URL}/shift-response/${token}`;
      const declineUrl = `${FRONTEND_URL}/shift-response/${token}`;

      const html = getShiftNotificationHtml({
        employeeName,
        restaurantName,
        date: dateFormatted,
        startTime,
        endTime,
        position: shiftDetails.position,
        acceptUrl,
        declineUrl,
      });

      // Fire and forget
      sendEmail({
        to: employee.email,
        subject: `Nieuwe Shift: ${dateFormatted} bij ${restaurantName}`,
        html,
      }).catch((err) => console.error("[Planning] Failed to send shift notification email:", err));
    }
  } catch (err) {
    // Don't fail shift creation if notification fails
    console.error("[Planning] Error sending shift notification:", err);
  }
}

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/planning/shifts:
 *   get:
 *     summary: Get shifts for a date range
 *     description: Retrieve shifts for the restaurant within specified date range. Requires restaurant access.
 *     tags: [Staff Planning]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Restaurant UUID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering (YYYY-MM-DD)
 *       - in: query
 *         name: employee_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by specific employee
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, scheduled, confirmed, completed, cancelled]
 *         description: Filter by shift status
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of shifts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Shift'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get("/shifts", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { start_date, end_date, employee_id, status } = req.query;
    
    // Get shifts from database
    let shifts = await staffDb.getShifts(
      restaurantId, 
      start_date as string, 
      end_date as string, 
      employee_id as string
    );
    
    // Filter by status if specified
    if (status && typeof status === 'string') {
      shifts = shifts.filter(shift => shift.status === status);
    }
    
    // Transform for API response
    const shiftList = shifts.map(shift => {
      // Calculate duration in hours
      const startTime = new Date(`1970-01-01T${shift.start_time}`);
      const endTime = new Date(`1970-01-01T${shift.end_time}`);
      let duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      
      // Handle overnight shifts
      if (duration < 0) {
        duration += 24;
      }
      
      // Subtract break time
      const breakHours = shift.break_duration_minutes / 60;
      duration = Math.max(0, duration - breakHours);
      
      return {
        id: shift.id,
        restaurant_id: shift.restaurant_id,
        employee_id: shift.employee_id,
        employee_name: shift.employee ? 
          `${shift.employee.first_name} ${shift.employee.last_name}` : 
          'Unknown Employee',
        role: shift.employee?.position || shift.position,
        position: shift.position,
        date: shift.scheduled_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        duration_hours: Math.round(duration * 100) / 100,
        break_duration_minutes: shift.break_duration_minutes,
        status: shift.status,
        notes: shift.notes,
        created_by: shift.created_by,
        created_at: shift.created_at,
        updated_at: shift.updated_at,
        notified_at: shift.notified_at || null,
        notified_date: shift.notified_date || null,
        notified_start_time: shift.notified_start_time || null,
        notified_end_time: shift.notified_end_time || null
      };
    });

    res.json(shiftList);
  } catch (error: any) {
    console.error("Error fetching shifts:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to fetch shifts",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/planning/shifts:
 *   post:
 *     summary: Create new shift
 *     description: Create a new shift schedule. Requires management access.
 *     tags: [Staff Planning]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee_id
 *               - scheduled_date
 *               - start_time
 *               - end_time
 *               - position
 *             properties:
 *               employee_id:
 *                 type: string
 *                 format: uuid
 *               scheduled_date:
 *                 type: string
 *                 format: date
 *               start_time:
 *                 type: string
 *                 format: time
 *                 pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *               end_time:
 *                 type: string
 *                 format: time
 *                 pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *               position:
 *                 type: string
 *               break_duration_minutes:
 *                 type: integer
 *                 minimum: 0
 *                 default: 30
 *               status:
 *                 type: string
 *                 enum: [draft, scheduled, confirmed]
 *                 default: draft
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Shift created successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post("/shifts", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { 
      employee_id, 
      scheduled_date, 
      start_time, 
      end_time, 
      position, 
      break_duration_minutes, 
      status, 
      notes 
    } = req.body;
    
    // Validate required fields
    if (!employee_id || !scheduled_date || !start_time || !end_time || !position) {
      res.status(400).json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "employee_id, scheduled_date, start_time, end_time, and position are required"
      });
      return;
    }
    
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
      res.status(400).json({
        error: "INVALID_TIME_FORMAT",
        message: "start_time and end_time must be in HH:MM format"
      });
      return;
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(scheduled_date)) {
      res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "scheduled_date must be in YYYY-MM-DD format"
      });
      return;
    }
    
    // Validate break duration
    const breakMinutes = parseInt(break_duration_minutes) || 30;
    if (breakMinutes < 0) {
      res.status(400).json({
        error: "INVALID_BREAK_DURATION",
        message: "break_duration_minutes must be a non-negative number"
      });
      return;
    }
    
    // Check if employee exists and belongs to this restaurant
    const employee = await staffDb.getEmployeeById(employee_id, restaurantId);
    if (!employee) {
      res.status(400).json({
        error: "EMPLOYEE_NOT_FOUND",
        message: "Employee not found in this restaurant"
      });
      return;
    }
    
    if (!employee.active) {
      res.status(400).json({
        error: "EMPLOYEE_INACTIVE",
        message: "Cannot schedule shifts for inactive employees"
      });
      return;
    }
    
    // Default to 'scheduled' instead of 'draft' when employee has email
    const shiftStatus = status || (employee.email ? 'scheduled' : 'draft');

    const newShift = await staffDb.createShift({
      restaurant_id: restaurantId,
      employee_id,
      scheduled_date,
      start_time,
      end_time,
      position,
      break_duration_minutes: breakMinutes,
      status: shiftStatus,
      notes: notes?.trim(),
      created_by: req.user!.id
    });
    
    // Email notifications are now sent via the bulk "confirm & send" flow
    // See POST /notify-weekly endpoint
    
    // Calculate duration for response
    const startTimeObj = new Date(`1970-01-01T${start_time}`);
    const endTimeObj = new Date(`1970-01-01T${end_time}`);
    let duration = (endTimeObj.getTime() - startTimeObj.getTime()) / (1000 * 60 * 60);
    if (duration < 0) duration += 24;
    duration = Math.max(0, duration - (breakMinutes / 60));
    
    res.status(201).json({
      id: newShift.id,
      restaurant_id: newShift.restaurant_id,
      employee_id: newShift.employee_id,
      employee_name: newShift.employee ? 
        `${newShift.employee.first_name} ${newShift.employee.last_name}` : 
        employee.first_name + ' ' + employee.last_name,
      role: newShift.employee?.position || position,
      position: newShift.position,
      date: newShift.scheduled_date,
      start_time: newShift.start_time,
      end_time: newShift.end_time,
      duration_hours: Math.round(duration * 100) / 100,
      break_duration_minutes: newShift.break_duration_minutes,
      status: newShift.status,
      notes: newShift.notes,
      created_by: newShift.created_by,
      created_at: newShift.created_at
    });
  } catch (error: any) {
    console.error("Error creating shift:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to create shift",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/planning/shifts/{shiftId}:
 *   put:
 *     summary: Update shift
 *     description: Update an existing shift. Requires management access.
 *     tags: [Staff Planning]
 */
router.put("/shifts/:shiftId", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, shiftId } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.restaurant_id;
    delete updates.created_at;
    delete updates.created_by;
    
    // Validate time format if provided
    if (updates.start_time || updates.end_time) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (updates.start_time && !timeRegex.test(updates.start_time)) {
        res.status(400).json({
          error: "INVALID_START_TIME",
          message: "start_time must be in HH:MM format"
        });
        return;
      }
      if (updates.end_time && !timeRegex.test(updates.end_time)) {
        res.status(400).json({
          error: "INVALID_END_TIME",
          message: "end_time must be in HH:MM format"
        });
        return;
      }
    }
    
    // Validate date format if provided
    if (updates.scheduled_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(updates.scheduled_date)) {
        res.status(400).json({
          error: "INVALID_DATE_FORMAT",
          message: "scheduled_date must be in YYYY-MM-DD format"
        });
        return;
      }
    }
    
    // Validate break duration if provided
    if (updates.break_duration_minutes !== undefined) {
      const breakMinutes = parseInt(updates.break_duration_minutes);
      if (isNaN(breakMinutes) || breakMinutes < 0) {
        res.status(400).json({
          error: "INVALID_BREAK_DURATION",
          message: "break_duration_minutes must be a non-negative number"
        });
        return;
      }
      updates.break_duration_minutes = breakMinutes;
    }
    
    // Validate status if provided
    if (updates.status) {
      const validStatuses = ['draft', 'scheduled', 'confirmed', 'completed', 'cancelled', 'declined'];
      if (!validStatuses.includes(updates.status)) {
        res.status(400).json({
          error: "INVALID_STATUS",
          message: `status must be one of: ${validStatuses.join(', ')}`
        });
        return;
      }
    }
    
    const updatedShift = await staffDb.updateShift(shiftId, restaurantId, updates);
    
    // Calculate duration for response
    const startTime = new Date(`1970-01-01T${updatedShift.start_time}`);
    const endTime = new Date(`1970-01-01T${updatedShift.end_time}`);
    let duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    if (duration < 0) duration += 24;
    duration = Math.max(0, duration - (updatedShift.break_duration_minutes / 60));
    
    res.json({
      id: updatedShift.id,
      restaurant_id: updatedShift.restaurant_id,
      employee_id: updatedShift.employee_id,
      employee_name: updatedShift.employee ? 
        `${updatedShift.employee.first_name} ${updatedShift.employee.last_name}` : 
        'Unknown Employee',
      role: updatedShift.employee?.position || updatedShift.position,
      position: updatedShift.position,
      date: updatedShift.scheduled_date,
      start_time: updatedShift.start_time,
      end_time: updatedShift.end_time,
      duration_hours: Math.round(duration * 100) / 100,
      break_duration_minutes: updatedShift.break_duration_minutes,
      status: updatedShift.status,
      notes: updatedShift.notes,
      updated_at: updatedShift.updated_at
    });
  } catch (error: any) {
    console.error("Error updating shift:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to update shift",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/planning/shifts/{shiftId}:
 *   delete:
 *     summary: Delete shift
 *     description: Delete a shift permanently. Requires management access.
 *     tags: [Staff Planning]
 */
router.delete("/shifts/:shiftId", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, shiftId } = req.params;
    
    await staffDb.deleteShift(shiftId, restaurantId);
    
    res.json({
      success: true,
      message: "Shift deleted successfully",
      restaurant_id: restaurantId,
      shift_id: shiftId,
      deleted_at: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Error deleting shift:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to delete shift",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/planning/templates:
 *   get:
 *     summary: Get recurring schedule templates
 *     description: Retrieve all schedule templates for the restaurant. Requires restaurant access.
 *     tags: [Staff Planning]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of schedule templates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ScheduleTemplate'
 */
router.get("/templates", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    
    const templates = await staffDb.getScheduleTemplates(restaurantId);
    
    res.json(templates.map(template => ({
      id: template.id,
      restaurant_id: template.restaurant_id,
      name: template.name,
      description: template.description,
      template_data: template.template_data,
      active: template.active,
      created_by: template.created_by,
      created_at: template.created_at,
      updated_at: template.updated_at
    })));
  } catch (error: any) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to fetch schedule templates",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/planning/templates:
 *   post:
 *     summary: Create schedule template
 *     description: Create a new recurring schedule template. Requires management access.
 *     tags: [Staff Planning]
 */
router.post("/templates", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { name, description, template_data } = req.body;
    
    if (!name || !template_data) {
      res.status(400).json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "name and template_data are required"
      });
      return;
    }
    
    if (typeof template_data !== 'object') {
      res.status(400).json({
        error: "INVALID_TEMPLATE_DATA",
        message: "template_data must be a valid object"
      });
      return;
    }
    
    const newTemplate = await staffDb.createScheduleTemplate({
      restaurant_id: restaurantId,
      name: name.trim(),
      description: description?.trim(),
      template_data,
      active: true,
      created_by: req.user!.id
    });
    
    res.status(201).json({
      id: newTemplate.id,
      restaurant_id: newTemplate.restaurant_id,
      name: newTemplate.name,
      description: newTemplate.description,
      template_data: newTemplate.template_data,
      active: newTemplate.active,
      created_by: newTemplate.created_by,
      created_at: newTemplate.created_at
    });
  } catch (error: any) {
    console.error("Error creating template:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to create schedule template",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/planning/shifts/bulk:
 *   post:
 *     summary: Create multiple shifts at once
 *     description: Create multiple shifts in a single request. Useful for applying templates. Requires management access.
 *     tags: [Staff Planning]
 */
router.post("/shifts/bulk", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { shifts } = req.body;
    
    if (!Array.isArray(shifts) || shifts.length === 0) {
      res.status(400).json({
        error: "INVALID_SHIFTS_DATA",
        message: "shifts must be a non-empty array"
      });
      return;
    }
    
    if (shifts.length > 100) {
      res.status(400).json({
        error: "TOO_MANY_SHIFTS",
        message: "Cannot create more than 100 shifts at once"
      });
      return;
    }
    
    const createdShifts = [];
    const errors = [];
    
    for (let i = 0; i < shifts.length; i++) {
      try {
        const shift = shifts[i];
        
        // Validate required fields
        if (!shift.employee_id || !shift.scheduled_date || !shift.start_time || !shift.end_time || !shift.position) {
          errors.push({
            index: i,
            error: "MISSING_REQUIRED_FIELDS",
            message: "employee_id, scheduled_date, start_time, end_time, and position are required"
          });
          continue;
        }
        
        // Check if employee exists
        const employee = await staffDb.getEmployeeById(shift.employee_id, restaurantId);
        if (!employee || !employee.active) {
          errors.push({
            index: i,
            error: "INVALID_EMPLOYEE",
            message: "Employee not found or inactive"
          });
          continue;
        }
        
        // Default to 'scheduled' instead of 'draft' when employee has email
        const bulkShiftStatus = shift.status || (employee.email ? 'scheduled' : 'draft');

        const newShift = await staffDb.createShift({
          restaurant_id: restaurantId,
          employee_id: shift.employee_id,
          scheduled_date: shift.scheduled_date,
          start_time: shift.start_time,
          end_time: shift.end_time,
          position: shift.position,
          break_duration_minutes: parseInt(shift.break_duration_minutes) || 30,
          status: bulkShiftStatus,
          notes: shift.notes?.trim(),
          created_by: req.user!.id
        });
        
        // Email notifications are now sent via the bulk "confirm & send" flow

        createdShifts.push({
          id: newShift.id,
          employee_id: newShift.employee_id,
          scheduled_date: newShift.scheduled_date,
          start_time: newShift.start_time,
          end_time: newShift.end_time,
          position: newShift.position,
          status: newShift.status
        });
      } catch (error: any) {
        errors.push({
          index: i,
          error: "CREATION_FAILED",
          message: error.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      created_count: createdShifts.length,
      error_count: errors.length,
      created_shifts: createdShifts,
      errors: errors
    });
  } catch (error: any) {
    console.error("Error creating bulk shifts:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to create bulk shifts",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/planning/notify-weekly:
 *   post:
 *     summary: Send weekly shift notification emails to employees
 *     description: |
 *       Groups shifts by employee for the given week and sends a single email per employee
 *       with all their shifts. Creates response tokens and notifications. Owner only.
 *     tags: [Planning]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - start_date
 *               - end_date
 *             properties:
 *               start_date:
 *                 type: string
 *                 format: date
 *               end_date:
 *                 type: string
 *                 format: date
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Emails sent
 */
/**
 * GET /notification-status — Get notification & response status for a date range
 */
router.get("/notification-status", async (req: Request, res: Response): Promise<void> => {
  try {
    const restaurantId = req.restaurantId!;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      res.status(400).json({ error: "MISSING_DATES", message: "start_date and end_date are required" });
      return;
    }

    // Get all response tokens for this period
    const tokens = await staffDb.getShiftResponseTokensByDateRange(
      restaurantId,
      start_date as string,
      end_date as string
    );

    // Get all shifts for context
    const allShifts = await staffDb.getShifts(restaurantId, start_date as string, end_date as string);
    const employees = await staffDb.getEmployees(restaurantId);
    const employeeMap = new Map(employees.map((e: any) => [e.id, e]));

    // Build per-employee status
    const byEmployee = new Map<string, {
      employee_id: string;
      name: string;
      email: string | null;
      color: string;
      total_shifts: number;
      notified_shifts: number;
      response: 'none' | 'pending' | 'accepted' | 'declined' | 'mixed';
      last_notified_at: string | null;
      responded_at: string | null;
      token_action: string | null;
      shifts: any[];
    }>();

    // Group shifts by employee
    for (const shift of allShifts) {
      const empId = shift.employee_id;
      if (!empId) continue;
      const emp = employeeMap.get(empId) as any;
      if (!emp) continue;

      if (!byEmployee.has(empId)) {
        byEmployee.set(empId, {
          employee_id: empId,
          name: `${emp.first_name} ${emp.last_name}`,
          email: emp.email,
          color: emp.color || '#6b7280',
          total_shifts: 0,
          notified_shifts: 0,
          response: 'none',
          last_notified_at: null,
          responded_at: null,
          token_action: null,
          shifts: [],
        });
      }

      const entry = byEmployee.get(empId)!;
      entry.total_shifts++;
      if (shift.notified_at) entry.notified_shifts++;
      if (shift.notified_at && (!entry.last_notified_at || new Date(shift.notified_at) > new Date(entry.last_notified_at))) {
        entry.last_notified_at = shift.notified_at;
      }
      entry.shifts.push({
        id: shift.id,
        date: shift.scheduled_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        position: shift.position,
        status: shift.status,
        notified_at: shift.notified_at,
      });
    }

    // Enrich with response token data
    for (const token of tokens) {
      const empId = token.employee?.id;
      if (!empId || !byEmployee.has(empId)) continue;
      const entry = byEmployee.get(empId)!;

      if (token.action) {
        if (entry.token_action && entry.token_action !== token.action) {
          entry.response = 'mixed';
        } else {
          entry.response = token.action;
          entry.token_action = token.action;
        }
        if (token.responded_at) {
          entry.responded_at = token.responded_at;
        }
      } else if (entry.last_notified_at && entry.response === 'none') {
        entry.response = 'pending';
      }
    }

    // Derive response from actual shift statuses (source of truth)
    for (const entry of byEmployee.values()) {
      const statuses = new Set(entry.shifts.map((s: any) => s.status));
      if (statuses.has('declined') || statuses.has('cancelled')) {
        if (statuses.has('confirmed')) {
          entry.response = 'mixed';
        } else if ([...statuses].every((st) => st === 'declined' || st === 'cancelled')) {
          entry.response = 'declined';
        }
      } else if (statuses.has('confirmed') && !statuses.has('scheduled')) {
        entry.response = 'accepted';
      } else if (entry.last_notified_at && entry.response === 'none') {
        entry.response = 'pending';
      }
    }

    res.json({
      success: true,
      employees: Array.from(byEmployee.values()),
    });
  } catch (error: any) {
    console.error("Error fetching notification status:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to fetch notification status" });
  }
});

// Guard against duplicate notification sends (in-flight dedup)
const notifyInFlight = new Set<string>();

router.post("/notify-weekly", adminLimiter, async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date, employee_ids, force } = req.body;
  const dedupKey = `${req.restaurantId}:${start_date}:${end_date}:${(employee_ids || []).sort().join(',')}`;
  try {
    const restaurantId = req.restaurantId!;
    if (notifyInFlight.has(dedupKey)) {
      res.status(429).json({ error: "DUPLICATE_REQUEST", message: "Notification already being sent for this period." });
      return;
    }
    notifyInFlight.add(dedupKey);

    // Auto-cleanup after 30s
    setTimeout(() => notifyInFlight.delete(dedupKey), 30_000);

    if (!start_date || !end_date) {
      res.status(400).json({ error: "MISSING_DATES", message: "start_date and end_date are required" });
      return;
    }

    // Get all shifts for the period
    const allShifts = await staffDb.getShifts(restaurantId, start_date, end_date);

    if (!allShifts || allShifts.length === 0) {
      res.status(400).json({ error: "NO_SHIFTS", message: "No shifts found for this period" });
      return;
    }

    // Get all employees
    const employees = await staffDb.getEmployees(restaurantId);
    const employeeMap = new Map(employees.map((e: any) => [e.id, e]));

    // Group ALL shifts by employee (for the full email)
    const allShiftsByEmployee = new Map<string, any[]>();
    for (const shift of allShifts) {
      const empId = shift.employee_id;
      if (!empId) continue;
      if (!allShiftsByEmployee.has(empId)) allShiftsByEmployee.set(empId, []);
      allShiftsByEmployee.get(empId)!.push(shift);
    }

    // Determine which employees have CHANGED shifts (new or schedule modified since last notification)
    // A shift is "changed" if: never notified, OR date/time differ from notified snapshot
    const employeesWithChanges = new Set<string>();
    for (const shift of allShifts) {
      if (!shift.employee_id) continue;
      if (!shift.notified_at) {
        // Never notified — always a change
        employeesWithChanges.add(shift.employee_id);
      } else if (shift.notified_date && shift.notified_start_time && shift.notified_end_time) {
        // Compare actual schedule vs notified snapshot
        if (shift.scheduled_date !== shift.notified_date ||
            shift.start_time !== shift.notified_start_time ||
            shift.end_time !== shift.notified_end_time) {
          employeesWithChanges.add(shift.employee_id);
        }
      } else {
        // Legacy fallback: no snapshot stored, use timestamp comparison
        const notifiedAt = new Date(shift.notified_at).getTime();
        const updatedAt = shift.updated_at ? new Date(shift.updated_at).getTime() : Date.now();
        if (updatedAt > notifiedAt) {
          employeesWithChanges.add(shift.employee_id);
        }
      }
    }

    const restaurantName = await staffDb.getRestaurantName(restaurantId);
    
    const formatDutchDayFull = (dateStr: string) => {
      try {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" });
      } catch { return dateStr; }
    };

    const results: { employee_name: string; email: string; shifts_count: number; changed: boolean; status: string }[] = [];
    const allNotifiedShiftIds: string[] = [];

    for (const [empId, empShifts] of allShiftsByEmployee) {
      // If employee_ids filter provided, skip employees not in the list
      if (Array.isArray(employee_ids) && employee_ids.length > 0 && !employee_ids.includes(empId)) {
        continue;
      }

      const employee = employeeMap.get(empId) as any;
      if (!employee) continue;

      const employeeName = `${employee.first_name} ${employee.last_name}`;
      const hasChanges = employeesWithChanges.has(empId);

      // Skip employees with no changes (unless force=true for resend)
      if (!hasChanges && !force) {
        results.push({ employee_name: employeeName, email: employee.email || "", shifts_count: empShifts.length, changed: false, status: "no_changes" });
        continue;
      }

      if (!employee.email) {
        results.push({ employee_name: employeeName, email: "", shifts_count: empShifts.length, changed: true, status: "no_email" });
        continue;
      }

      // Sort shifts by date
      empShifts.sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date));

      // Collect shift IDs to mark as notified
      empShifts.forEach((s: any) => allNotifiedShiftIds.push(s.id));

      // Create a single response token
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      await staffDb.createShiftResponseToken({
        shift_id: empShifts[0].id,
        employee_id: empId,
        restaurant_id: restaurantId,
        token,
        expires_at: expiresAt,
      });

      const responseUrl = `${FRONTEND_URL}/shift-response/${token}`;

      const shiftEntries = empShifts.map((s: any) => ({
        date: formatDutchDayFull(s.scheduled_date),
        startTime: s.start_time.substring(0, 5),
        endTime: s.end_time.substring(0, 5),
        position: s.position || employee.position || "",
      }));

      // Week range for subject
      const firstDate = empShifts[0].scheduled_date;
      const lastDate = empShifts[empShifts.length - 1].scheduled_date;
      const subjectRange = firstDate === lastDate
        ? formatDutchDayFull(firstDate)
        : `${formatDutchDayFull(firstDate)} – ${formatDutchDayFull(lastDate)}`;

      const html = getWeeklyShiftNotificationHtml({
        employeeName,
        restaurantName,
        weekLabel: subjectRange,
        shifts: shiftEntries,
        responseUrl,
      });

      try {
        await sendEmail({
          to: employee.email,
          subject: `Nieuw rooster bij ${restaurantName}: ${subjectRange}`,
          html,
        });
        results.push({ employee_name: employeeName, email: employee.email, shifts_count: empShifts.length, changed: true, status: "sent" });
        // Rate limit: Resend free plan allows max 2 requests/sec
        await new Promise(resolve => setTimeout(resolve, 600));
      } catch (err: any) {
        console.error(`[notify-weekly] Failed to send to ${employee.email}:`, err);
        results.push({ employee_name: employeeName, email: employee.email, shifts_count: empShifts.length, changed: true, status: "failed" });
      }
    }

    // Mark all sent shifts as notified
    if (allNotifiedShiftIds.length > 0) {
      await staffDb.markShiftsNotified(allNotifiedShiftIds);
    }

    // Create single notification for managers
    const sentCount = results.filter(r => r.status === "sent").length;
    if (sentCount > 0) {
      const managers = await staffDb.getRestaurantManagers(restaurantId);
      for (const manager of managers) {
        await staffDb.createNotification({
          restaurant_id: restaurantId,
          recipient_user_id: manager.user_id,
          type: "shift_pending",
          title: `Werkrooster verstuurd naar ${sentCount} medewerker(s)`,
          message: `Planning ${start_date} – ${end_date} verstuurd. Wacht op bevestiging.`,
          metadata: { start_date, end_date, sent_count: sentCount },
        });
      }
    }

    notifyInFlight.delete(dedupKey);

    res.json({
      success: true,
      total_employees: results.length,
      sent: results.filter(r => r.status === "sent").length,
      failed: results.filter(r => r.status === "failed").length,
      no_email: results.filter(r => r.status === "no_email").length,
      no_changes: results.filter(r => r.status === "no_changes").length,
      details: results,
    });

  } catch (error: any) {
    notifyInFlight.delete(dedupKey);
    console.error("Error sending weekly notifications:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to send weekly notifications" });
  }
});

export default router;