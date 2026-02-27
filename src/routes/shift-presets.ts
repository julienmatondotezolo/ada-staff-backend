import { Router, Request, Response } from "express";
import { staffDb } from "../lib/database-service";
import { authenticateToken, requireRestaurantAccess, requireStaffManagement } from "../middleware/auth";
import { publicLimiter, adminLimiter } from "../middleware/rate-limit";

const router = Router({ mergeParams: true });

// All routes require authentication + restaurant access
router.use(authenticateToken);
router.use(requireRestaurantAccess());

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/shift-presets:
 *   get:
 *     summary: Get all shift presets
 *     description: >
 *       Retrieve named shift presets for the restaurant (e.g. "Midi", "Soir", "Journée").
 *       Each preset has a name, color, and one or more time ranges.
 *       Used in the planning calendar for quick shift creation.
 *     tags: [Shift Presets]
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
 *         description: List of shift presets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ShiftPreset'
 */
router.get("/", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const presets = await staffDb.getShiftPresets(restaurantId);
    res.json(presets);
  } catch (error: any) {
    console.error("Error fetching shift presets:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch shift presets",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/shift-presets:
 *   post:
 *     summary: Create a shift preset
 *     description: >
 *       Create a new named shift preset. A preset can contain multiple time ranges
 *       (e.g. "Coupure" = 10:00-14:00 + 17:00-22:00). Requires manager or owner role.
 *     tags: [Shift Presets]
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
 *             required: [name, shifts]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Soir"
 *               color:
 *                 type: string
 *                 example: "#6366f1"
 *               shifts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     start_time:
 *                       type: string
 *                       example: "18:30"
 *                     end_time:
 *                       type: string
 *                       example: "21:30"
 *               sort_order:
 *                 type: integer
 *                 example: 0
 *     responses:
 *       201:
 *         description: Shift preset created
 *       400:
 *         description: Invalid request body
 */
router.post("/", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { name, color, shifts, sort_order } = req.body;

    // Validate
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: "INVALID_NAME", message: "Name is required" });
      return;
    }

    if (!shifts || !Array.isArray(shifts) || shifts.length === 0) {
      res.status(400).json({ error: "INVALID_SHIFTS", message: "At least one shift time range is required" });
      return;
    }

    for (const shift of shifts) {
      if (!shift.start_time || !shift.end_time) {
        res.status(400).json({
          error: "INVALID_SHIFT_TIME",
          message: "Each shift must have start_time and end_time (HH:MM format)",
        });
        return;
      }
    }

    const preset = await staffDb.createShiftPreset({
      restaurant_id: restaurantId,
      name: name.trim(),
      color: color || '#6366f1',
      shifts,
      is_active: true,
      sort_order: sort_order ?? 0,
    });

    res.status(201).json(preset);
  } catch (error: any) {
    console.error("Error creating shift preset:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to create shift preset",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/shift-presets/{presetId}:
 *   put:
 *     summary: Update a shift preset
 *     tags: [Shift Presets]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: presetId
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
 *             properties:
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *               shifts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     start_time:
 *                       type: string
 *                     end_time:
 *                       type: string
 *               sort_order:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Shift preset updated
 *       404:
 *         description: Preset not found
 */
router.put("/:presetId", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, presetId } = req.params;
    const { name, color, shifts, sort_order } = req.body;

    // Check exists
    const existing = await staffDb.getShiftPresetById(presetId, restaurantId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND", message: "Shift preset not found" });
      return;
    }

    // Validate shifts if provided
    if (shifts !== undefined) {
      if (!Array.isArray(shifts) || shifts.length === 0) {
        res.status(400).json({ error: "INVALID_SHIFTS", message: "Shifts must be a non-empty array" });
        return;
      }
      for (const shift of shifts) {
        if (!shift.start_time || !shift.end_time) {
          res.status(400).json({
            error: "INVALID_SHIFT_TIME",
            message: "Each shift must have start_time and end_time",
          });
          return;
        }
      }
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color;
    if (shifts !== undefined) updates.shifts = shifts;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const preset = await staffDb.updateShiftPreset(presetId, restaurantId, updates);
    res.json(preset);
  } catch (error: any) {
    console.error("Error updating shift preset:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to update shift preset",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/shift-presets/{presetId}:
 *   delete:
 *     summary: Delete a shift preset (soft delete)
 *     tags: [Shift Presets]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: presetId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Shift preset deleted
 *       404:
 *         description: Preset not found
 */
router.delete("/:presetId", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, presetId } = req.params;

    const existing = await staffDb.getShiftPresetById(presetId, restaurantId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND", message: "Shift preset not found" });
      return;
    }

    await staffDb.deleteShiftPreset(presetId, restaurantId);
    res.json({ success: true, message: "Shift preset deleted" });
  } catch (error: any) {
    console.error("Error deleting shift preset:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to delete shift preset",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/shift-presets/reorder:
 *   put:
 *     summary: Reorder shift presets
 *     tags: [Shift Presets]
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
 *             properties:
 *               ordered_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Order updated
 */
router.put("/reorder", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { ordered_ids } = req.body;

    if (!ordered_ids || !Array.isArray(ordered_ids)) {
      res.status(400).json({ error: "INVALID_BODY", message: "ordered_ids array is required" });
      return;
    }

    await staffDb.reorderShiftPresets(restaurantId, ordered_ids);
    res.json({ success: true, message: "Presets reordered" });
  } catch (error: any) {
    console.error("Error reordering shift presets:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to reorder shift presets",
      details: error.message,
    });
  }
});

export default router;
