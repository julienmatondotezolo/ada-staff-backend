import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

// Custom key generator that safely handles proxy situations
const safeKeyGenerator = (req: Request) => {
  // Try to get real IP address safely
  const forwarded = req.headers['x-forwarded-for'] as string;
  const realIp = req.headers['x-real-ip'] as string;
  
  // Use the first IP from x-forwarded-for, or real-ip, or connection IP
  if (forwarded && typeof forwarded === 'string') {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp && firstIp !== 'undefined') {
      return firstIp;
    }
  }
  
  if (realIp && typeof realIp === 'string' && realIp !== 'undefined') {
    return realIp;
  }
  
  // Fallback to connection IP
  return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
};

/**
 * Public rate limiter for general API access
 * 100 requests per 15 minutes per IP
 */
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  keyGenerator: safeKeyGenerator, // Use custom key generator
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests from this IP, please try again after 15 minutes"
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests from this IP, please try again after 15 minutes",
      retryAfter: Math.round(Date.now() / 1000) + (15 * 60)
    });
  }
});

/**
 * Admin rate limiter for management operations
 * 50 requests per 15 minutes per IP
 */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 admin requests per windowMs
  keyGenerator: safeKeyGenerator, // Use custom key generator
  message: {
    error: "ADMIN_RATE_LIMIT_EXCEEDED",
    message: "Too many admin requests from this IP, please try again after 15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: "ADMIN_RATE_LIMIT_EXCEEDED",
      message: "Too many admin requests from this IP, please try again after 15 minutes",
      retryAfter: Math.round(Date.now() / 1000) + (15 * 60)
    });
  }
});

/**
 * Strict rate limiter for sensitive operations
 * 20 requests per 15 minutes per IP
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  keyGenerator: safeKeyGenerator, // Use custom key generator
  message: {
    error: "STRICT_RATE_LIMIT_EXCEEDED",
    message: "Too many requests from this IP, please try again after 15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: "STRICT_RATE_LIMIT_EXCEEDED",
      message: "Too many sensitive requests from this IP, please try again after 15 minutes",
      retryAfter: Math.round(Date.now() / 1000) + (15 * 60)
    });
  }
});