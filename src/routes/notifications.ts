import { Router, Request, Response } from "express";
import { staffDb } from "../lib/database-service";
import { authenticateToken, requireRestaurantAccess } from "../middleware/auth";
import { publicLimiter } from "../middleware/rate-limit";

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireRestaurantAccess());

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/notifications:
 *   get:
 *     summary: Get notifications
 *     description: Retrieve notifications for the restaurant (paginated, newest first).
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Restaurant UUID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of notifications to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *       - in: query
 *         name: unread_only
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Only return unread notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   type:
 *                     type: string
 *                   title:
 *                     type: string
 *                   message:
 *                     type: string
 *                   read:
 *                     type: boolean
 *                   metadata:
 *                     type: object
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const unreadOnly = req.query.unread_only === "true";

    const notifications = await staffDb.getNotifications(restaurantId, {
      limit,
      offset,
      unreadOnly,
    });

    res.json(notifications);
  } catch (error: any) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch notifications",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     description: Returns the number of unread notifications for the restaurant.
 *     tags: [Notifications]
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
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unread_count:
 *                   type: integer
 */
router.get("/unread-count", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const userId = req.user?.id;

    const count = await staffDb.getUnreadNotificationCount(restaurantId, userId);

    res.json({ unread_count: count });
  } catch (error: any) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch unread notification count",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     description: Mark all unread notifications as read for the restaurant.
 *     tags: [Notifications]
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
 *         description: All notifications marked as read
 */
router.put("/read-all", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const userId = req.user?.id;

    await staffDb.markAllNotificationsRead(restaurantId, userId);

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error: any) {
    console.error("Error marking all as read:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to mark all notifications as read",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/notifications/{id}/read:
 *   put:
 *     summary: Mark notification as read
 *     description: Mark a single notification as read.
 *     tags: [Notifications]
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
 *         description: Notification marked as read
 */
router.put("/:id/read", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, id } = req.params;

    await staffDb.markNotificationRead(id, restaurantId);

    res.json({
      success: true,
      message: "Notification marked as read",
      notification_id: id,
    });
  } catch (error: any) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to mark notification as read",
      details: error.message,
    });
  }
});

export default router;
