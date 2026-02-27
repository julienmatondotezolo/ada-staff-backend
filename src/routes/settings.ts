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
 * /api/v1/restaurants/{restaurantId}/settings:
 *   get:
 *     summary: Get restaurant settings
 *     description: Retrieve settings for the restaurant including opening hours, schedule rules, and notifications. Any staff member with restaurant access can read settings.
 *     tags: [Restaurant Settings]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Restaurant UUID
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Restaurant settings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RestaurantSettings'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get("/", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;

    const settings = await staffDb.getRestaurantSettings(restaurantId);

    res.json(settings);
  } catch (error: any) {
    console.error("Error fetching restaurant settings:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch restaurant settings",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/settings:
 *   put:
 *     summary: Update restaurant settings
 *     description: Update restaurant settings. Requires manager or owner role.
 *     tags: [Restaurant Settings]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Restaurant UUID
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               opening_hours:
 *                 type: object
 *                 description: "Opening hours keyed by day (lundi-dimanche). Each day has enabled (bool) and slots (array of {from, to})."
 *                 example:
 *                   lundi:
 *                     enabled: false
 *                     slots: []
 *                   mardi:
 *                     enabled: true
 *                     slots:
 *                       - from: "12:00"
 *                         to: "14:00"
 *                       - from: "18:30"
 *                         to: "21:30"
 *               schedule_rules:
 *                 type: object
 *                 description: Default scheduling rules
 *                 properties:
 *                   default_break_minutes:
 *                     type: integer
 *                   max_hours_per_week:
 *                     type: integer
 *                   min_staff_per_service:
 *                     type: integer
 *                   min_rest_days_per_week:
 *                     type: integer
 *               restaurant_info:
 *                 type: object
 *                 description: Restaurant contact and address info
 *                 properties:
 *                   name:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   email:
 *                     type: string
 *                   address:
 *                     type: string
 *                   website:
 *                     type: string
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.put("/", requireStaffManagement(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { opening_hours, schedule_rules, restaurant_info } = req.body;

    // Validate opening_hours structure if provided
    if (opening_hours) {
      const validDays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
      for (const [day, config] of Object.entries(opening_hours)) {
        if (!validDays.includes(day)) {
          res.status(400).json({
            error: "INVALID_DAY",
            message: `Invalid day: ${day}. Must be one of: ${validDays.join(', ')}`,
          });
          return;
        }
        const dayConfig = config as any;
        if (typeof dayConfig.enabled !== 'boolean') {
          res.status(400).json({
            error: "INVALID_OPENING_HOURS",
            message: `Day ${day} must have an 'enabled' boolean field`,
          });
          return;
        }
        if (!Array.isArray(dayConfig.slots)) {
          res.status(400).json({
            error: "INVALID_OPENING_HOURS",
            message: `Day ${day} must have a 'slots' array`,
          });
          return;
        }
        for (const slot of dayConfig.slots) {
          if (!slot.from || !slot.to) {
            res.status(400).json({
              error: "INVALID_TIME_SLOT",
              message: `Each slot for ${day} must have 'from' and 'to' fields (HH:MM format)`,
            });
            return;
          }
        }
      }
    }

    const updates: Record<string, any> = {};
    if (opening_hours !== undefined) updates.opening_hours = opening_hours;
    if (schedule_rules !== undefined) updates.schedule_rules = schedule_rules;
    if (restaurant_info !== undefined) updates.restaurant_info = restaurant_info;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        error: "NO_UPDATES",
        message: "No valid fields to update. Provide opening_hours, schedule_rules, or restaurant_info.",
      });
      return;
    }

    const settings = await staffDb.updateRestaurantSettings(restaurantId, updates, req.user!.id);

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error: any) {
    console.error("Error updating restaurant settings:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to update restaurant settings",
      details: error.message,
    });
  }
});

export default router;
