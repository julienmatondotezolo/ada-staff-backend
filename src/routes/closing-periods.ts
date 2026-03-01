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
 * /api/v1/restaurants/{restaurantId}/closing-periods:
 *   get:
 *     summary: Get all closing periods
 *     description: >
 *       Retrieve all closing periods for the restaurant, ordered by start date.
 *       Used to display vacation/closure dates on the planning calendar.
 *     tags: [Closing Periods]
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
 *         description: List of closing periods
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ClosingPeriod'
 */
router.get("/", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const periods = await staffDb.getClosingPeriods(restaurantId);
    res.json(periods);
  } catch (error: any) {
    console.error("Error fetching closing periods:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch closing periods",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/closing-periods/{id}:
 *   get:
 *     summary: Get a single closing period
 *     tags: [Closing Periods]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Closing period details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClosingPeriod'
 *       404:
 *         description: Closing period not found
 */
router.get("/:id", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, id } = req.params;
    const period = await staffDb.getClosingPeriodById(id, restaurantId);

    if (!period) {
      res.status(404).json({ error: "NOT_FOUND", message: "Closing period not found" });
      return;
    }

    res.json(period);
  } catch (error: any) {
    console.error("Error fetching closing period:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch closing period",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/closing-periods:
 *   post:
 *     summary: Create a closing period
 *     description: >
 *       Create a new closing period (e.g. vacation, holiday closure).
 *       Requires manager or owner role.
 *     tags: [Closing Periods]
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
 *             required: [name, date_from, date_to]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Verlof"
 *               date_from:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-08"
 *               date_to:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-19"
 *               comment:
 *                 type: string
 *                 example: "Annual vacation"
 *     responses:
 *       201:
 *         description: Closing period created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClosingPeriod'
 *       400:
 *         description: Invalid request body
 */
router.post("/", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { name, date_from, date_to, comment } = req.body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "INVALID_NAME", message: "Name is required" });
      return;
    }

    if (!date_from || !date_to) {
      res.status(400).json({ error: "INVALID_DATES", message: "date_from and date_to are required (YYYY-MM-DD)" });
      return;
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date_from) || !dateRegex.test(date_to)) {
      res.status(400).json({ error: "INVALID_DATE_FORMAT", message: "Dates must be in YYYY-MM-DD format" });
      return;
    }

    // Validate date_from <= date_to
    if (date_from > date_to) {
      res.status(400).json({ error: "INVALID_DATE_RANGE", message: "date_from must be before or equal to date_to" });
      return;
    }

    const period = await staffDb.createClosingPeriod({
      restaurant_id: restaurantId,
      name: name.trim(),
      date_from,
      date_to,
      comment: comment?.trim() || undefined,
    });

    res.status(201).json(period);
  } catch (error: any) {
    console.error("Error creating closing period:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to create closing period",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/closing-periods/{id}:
 *   put:
 *     summary: Update a closing period
 *     tags: [Closing Periods]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
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
 *               date_from:
 *                 type: string
 *                 format: date
 *               date_to:
 *                 type: string
 *                 format: date
 *               comment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Closing period updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClosingPeriod'
 *       404:
 *         description: Closing period not found
 */
router.put("/:id", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, id } = req.params;
    const { name, date_from, date_to, comment } = req.body;

    // Check exists
    const existing = await staffDb.getClosingPeriodById(id, restaurantId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND", message: "Closing period not found" });
      return;
    }

    // Validate date format if provided
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (date_from !== undefined && !dateRegex.test(date_from)) {
      res.status(400).json({ error: "INVALID_DATE_FORMAT", message: "date_from must be in YYYY-MM-DD format" });
      return;
    }
    if (date_to !== undefined && !dateRegex.test(date_to)) {
      res.status(400).json({ error: "INVALID_DATE_FORMAT", message: "date_to must be in YYYY-MM-DD format" });
      return;
    }

    // Validate date range
    const effectiveFrom = date_from ?? existing.date_from;
    const effectiveTo = date_to ?? existing.date_to;
    if (effectiveFrom > effectiveTo) {
      res.status(400).json({ error: "INVALID_DATE_RANGE", message: "date_from must be before or equal to date_to" });
      return;
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name.trim();
    if (date_from !== undefined) updates.date_from = date_from;
    if (date_to !== undefined) updates.date_to = date_to;
    if (comment !== undefined) updates.comment = comment?.trim() || null;

    const period = await staffDb.updateClosingPeriod(id, restaurantId, updates);
    res.json(period);
  } catch (error: any) {
    console.error("Error updating closing period:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to update closing period",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/closing-periods/{id}:
 *   delete:
 *     summary: Delete a closing period
 *     description: Permanently deletes the closing period. This action cannot be undone.
 *     tags: [Closing Periods]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Closing period deleted
 *       404:
 *         description: Closing period not found
 */
router.delete("/:id", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, id } = req.params;

    const existing = await staffDb.getClosingPeriodById(id, restaurantId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND", message: "Closing period not found" });
      return;
    }

    await staffDb.deleteClosingPeriod(id, restaurantId);
    res.json({ success: true, message: "Closing period deleted" });
  } catch (error: any) {
    console.error("Error deleting closing period:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to delete closing period",
      details: error.message,
    });
  }
});

export default router;
