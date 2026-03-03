import "dotenv/config";
import express from "express";
import cors from "cors";

import planningRoutes from "./routes/planning";
import employeeRoutes from "./routes/employees";
import settingsRoutes from "./routes/settings";
import shiftPresetsRoutes from "./routes/shift-presets";
import closingPeriodsRoutes from "./routes/closing-periods";
import notificationsRoutes from "./routes/notifications";
import shiftResponseRoutes from "./routes/shift-responses";
import analyticsRoutes from "./routes/analytics";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { setupSwagger } from "./config/swagger";
import { staffDb } from "./lib/database-service";

const app = express();
const PORT = process.env.PORT || 5003; // AdaStaff on port 5003
const startTime = Date.now();

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : undefined;

app.use(
  cors({
    origin: allowedOrigins || true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "ngrok-skip-browser-warning",
      "X-Requested-With",
      "Accept",
      "Origin"
    ],
    credentials: true,
  })
);

// ─── Body parsers ──────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Request logging ───────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Database initialization ───────────────────────────────────────────────
async function initializeDatabase() {
  try {
    console.log("🔄 Initializing database tables...");
    await staffDb.initializeTables();
    await staffDb.initializeSettingsTable();
    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    // Don't exit - let the API run even if DB init fails
  }
}

// Initialize database on startup
initializeDatabase();

// ─── Swagger API Documentation ─────────────────────────────────────────────
setupSwagger(app);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the AdaStaff API service is running properly
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 service:
 *                   type: string
 *                   example: adastaff-api
 *                 version:
 *                   type: string
 *                   example: 3.0.0
 *                 uptime:
 *                   type: integer
 *                   description: Uptime in seconds
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 features:
 *                   type: object
 *                   properties:
 *                     authentication:
 *                       type: boolean
 *                       example: true
 *                     database:
 *                       type: boolean
 *                       example: true
 *                     staff_management:
 *                       type: boolean
 *                       example: true
 *                     shift_scheduling:
 *                       type: boolean
 *                       example: true
 */
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "adastaff-api",
    version: "3.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    features: {
      authentication: true,
      database: true,
      staff_management: true,
      shift_scheduling: true,
      schedule_templates: true,
      multi_tenant: true,
      notifications: true,
      shift_email_notifications: true,
      labor_cost_analytics: true
    }
  });
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: API information endpoint
 *     description: Get information about the AdaStaff API
 *     tags: [Info]
 *     responses:
 *       200:
 *         description: API information
 */
app.get("/", (_req, res) => {
  res.json({
    name: "AdaStaff API",
    description: "Employee Planning & Management Microservice",
    version: "3.0.0",
    features: [
      "Employee Management",
      "Shift Scheduling", 
      "Schedule Templates",
      "Closing Periods",
      "Shift Notifications & Email",
      "Shift Response Tokens",
      "Notifications System",
      "Labor Cost Analytics",
      "Multi-tenant Support",
      "AdaAuth Integration",
      "Real-time Database",
      "RESTful API",
      "OpenAPI Documentation"
    ],
    endpoints: {
      employees: "/api/v1/restaurants/{restaurantId}/employees",
      shifts: "/api/v1/restaurants/{restaurantId}/planning/shifts",
      templates: "/api/v1/restaurants/{restaurantId}/planning/templates",
      closing_periods: "/api/v1/restaurants/{restaurantId}/closing-periods",
      notifications: "/api/v1/restaurants/{restaurantId}/notifications",
      analytics: "/api/v1/restaurants/{restaurantId}/analytics/labor-cost",
      shift_response: "/api/v1/shift-response/{token}",
      health: "/health",
      docs: "/api-docs"
    },
    authentication: {
      type: "Bearer JWT",
      integration: "AdaAuth API",
      required: true,
      scopes: ["restaurant_access", "staff_management"]
    },
    support: {
      email: "support@mindgen.app",
      docs: "https://adastaff.mindgen.app/api-docs"
    }
  });
});

// ─── Staff Management Routes ───────────────────────────────────────────────
app.use("/api/v1/restaurants/:restaurantId/planning", planningRoutes);
app.use("/api/v1/restaurants/:restaurantId/employees", employeeRoutes);
app.use("/api/v1/restaurants/:restaurantId/settings", settingsRoutes);
app.use("/api/v1/restaurants/:restaurantId/shift-presets", shiftPresetsRoutes);
app.use("/api/v1/restaurants/:restaurantId/closing-periods", closingPeriodsRoutes);
app.use("/api/v1/restaurants/:restaurantId/notifications", notificationsRoutes);
app.use("/api/v1/restaurants/:restaurantId/analytics", analyticsRoutes);

// ─── Public Routes (token-based, no JWT) ───────────────────────────────────
app.use("/api/v1/shift-response", shiftResponseRoutes);

// ─── 404 handler ───────────────────────────────────────────────────────────
app.use("*", (req, res) => {
  res.status(404).json({
    error: "ENDPOINT_NOT_FOUND",
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    available_endpoints: {
      health: "/health",
      docs: "/api-docs",
      employees: "/api/v1/restaurants/{restaurantId}/employees",
      planning: "/api/v1/restaurants/{restaurantId}/planning/*",
      settings: "/api/v1/restaurants/{restaurantId}/settings",
      shift_presets: "/api/v1/restaurants/{restaurantId}/shift-presets",
      closing_periods: "/api/v1/restaurants/{restaurantId}/closing-periods",
      notifications: "/api/v1/restaurants/{restaurantId}/notifications",
      analytics: "/api/v1/restaurants/{restaurantId}/analytics",
      shift_response: "/api/v1/shift-response/{token}"
    },
    documentation: "https://adastaff.mindgen.app/api-docs"
  });
});

// ─── Global error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

// ─── Process-level error handling ──────────────────────────────────────────
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE" || err.code === "ECONNRESET") {
    console.warn(`[WARN] ${err.code} — client disconnected, ignoring.`);
    return;
  }
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// ─── Start server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('🚀 AdaStaff API v3.0.0 Started');
  console.log('=====================================');
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
  console.log(`📚 Docs: http://localhost:${PORT}/api-docs`);
  console.log(`👥 Employees: http://localhost:${PORT}/api/v1/restaurants/{id}/employees`);
  console.log(`📅 Planning: http://localhost:${PORT}/api/v1/restaurants/{id}/planning`);
  console.log('=====================================');
  console.log(`🏷️  Version: 3.0.0`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 CORS Origins: ${allowedOrigins?.join(', ') || 'All'}`);
  console.log(`🔐 Authentication: AdaAuth Integration Enabled`);
  console.log(`🗄️  Database: Supabase with RLS Security`);
  console.log(`⚡ Features: Employees, Shifts, Notifications, Analytics`);
  console.log('=====================================');
  
  // Log startup time
  const startupTime = Date.now() - startTime;
  console.log(`⏱️  Startup time: ${startupTime}ms`);
});

export default app;