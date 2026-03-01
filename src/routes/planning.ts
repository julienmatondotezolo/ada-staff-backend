import { Router, Request, Response } from "express";
import crypto from "crypto";
import { staffDb } from "../lib/database-service";
import { authenticateToken, requireRestaurantAccess, requireStaffManagement } from "../middleware/auth";
import { publicLimiter, adminLimiter } from "../middleware/rate-limit";
import { sendEmail } from "../lib/email-service";
import { getShiftNotificationHtml } from "../templates/shift-notification";

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireRestaurantAccess());

const BASE_URL = process.env.BASE_URL || "https://adastaff.mindgen.app";

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
      dateFormatted = d.toLocaleDateString("en-US", {
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
        title: `Shift assigned to ${employeeName}`,
        message: `${employeeName} has been assigned a shift on ${dateFormatted} (${startTime} - ${endTime}) as ${shiftDetails.position}. Awaiting response.`,
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

      const acceptUrl = `${BASE_URL}/api/v1/shift-response/${token}?action=accepted`;
      const declineUrl = `${BASE_URL}/api/v1/shift-response/${token}?action=declined`;

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
        subject: `New Shift: ${dateFormatted} at ${restaurantName}`,
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
        updated_at: shift.updated_at
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
    
    // Send shift notification (async, non-blocking)
    sendShiftNotification(
      newShift.id,
      employee_id,
      restaurantId,
      employee,
      { scheduled_date, start_time, end_time, position },
      req.user!.id
    );
    
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
      const validStatuses = ['draft', 'scheduled', 'confirmed', 'completed', 'cancelled'];
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
        
        // Send shift notification (async, non-blocking)
        sendShiftNotification(
          newShift.id,
          shift.employee_id,
          restaurantId,
          employee,
          {
            scheduled_date: shift.scheduled_date,
            start_time: shift.start_time,
            end_time: shift.end_time,
            position: shift.position,
          },
          req.user!.id
        );

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

export default router;