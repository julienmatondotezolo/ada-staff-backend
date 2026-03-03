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
 * /api/v1/restaurants/{restaurantId}/exclusive-opening-days:
 *   get:
 *     summary: Get all exclusive opening days
 *     description: >
 *       Retrieve all exclusive opening days for the restaurant, ordered by start date.
 *       Exclusive opening days have priority over normal opening hours.
 *     tags: [Exclusive Opening Days]
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
 *         description: List of exclusive opening days
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExclusiveOpeningDay'
 */
router.get("/", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const days = await staffDb.getExclusiveOpeningDays(restaurantId);
    res.json(days);
  } catch (error: any) {
    console.error("Error fetching exclusive opening days:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch exclusive opening days",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/exclusive-opening-days/{id}:
 *   get:
 *     summary: Get a single exclusive opening day
 *     tags: [Exclusive Opening Days]
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
 *         description: Exclusive opening day details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExclusiveOpeningDay'
 *       404:
 *         description: Exclusive opening day not found
 */
router.get("/:id", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, id } = req.params;
    const day = await staffDb.getExclusiveOpeningDayById(id, restaurantId);

    if (!day) {
      res.status(404).json({ error: "NOT_FOUND", message: "Exclusive opening day not found" });
      return;
    }

    res.json(day);
  } catch (error: any) {
    console.error("Error fetching exclusive opening day:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch exclusive opening day",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/exclusive-opening-days:
 *   post:
 *     summary: Create an exclusive opening day
 *     description: >
 *       Create a new exclusive opening day (e.g. special event, holiday opening).
 *       Requires manager or owner role.
 *     tags: [Exclusive Opening Days]
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
 *                 example: "Ouverture spéciale Noël"
 *               date_from:
 *                 type: string
 *                 format: date
 *                 example: "2026-12-25"
 *               date_to:
 *                 type: string
 *                 format: date
 *                 example: "2026-12-25"
 *               comment:
 *                 type: string
 *                 example: "Service spécial de Noël"
 *     responses:
 *       201:
 *         description: Exclusive opening day created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExclusiveOpeningDay'
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

    const day = await staffDb.createExclusiveOpeningDay({
      restaurant_id: restaurantId,
      name: name.trim(),
      date_from,
      date_to,
      comment: comment?.trim() || undefined,
    });

    res.status(201).json(day);
  } catch (error: any) {
    console.error("Error creating exclusive opening day:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to create exclusive opening day",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/exclusive-opening-days/{id}:
 *   put:
 *     summary: Update an exclusive opening day
 *     tags: [Exclusive Opening Days]
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
 *         description: Exclusive opening day updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExclusiveOpeningDay'
 *       404:
 *         description: Exclusive opening day not found
 */
router.put("/:id", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, id } = req.params;
    const { name, date_from, date_to, comment } = req.body;

    // Check exists
    const existing = await staffDb.getExclusiveOpeningDayById(id, restaurantId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND", message: "Exclusive opening day not found" });
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

    const day = await staffDb.updateExclusiveOpeningDay(id, restaurantId, updates);
    res.json(day);
  } catch (error: any) {
    console.error("Error updating exclusive opening day:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to update exclusive opening day",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/exclusive-opening-days/{id}:
 *   delete:
 *     summary: Delete an exclusive opening day
 *     description: Permanently deletes the exclusive opening day. This action cannot be undone.
 *     tags: [Exclusive Opening Days]
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
 *         description: Exclusive opening day deleted
 *       404:
 *         description: Exclusive opening day not found
 */
router.delete("/:id", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, id } = req.params;

    const existing = await staffDb.getExclusiveOpeningDayById(id, restaurantId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND", message: "Exclusive opening day not found" });
      return;
    }

    await staffDb.deleteExclusiveOpeningDay(id, restaurantId);
    res.json({ success: true, message: "Exclusive opening day deleted" });
  } catch (error: any) {
    console.error("Error deleting exclusive opening day:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to delete exclusive opening day",
      details: error.message,
    });
  }
});

export default router;
