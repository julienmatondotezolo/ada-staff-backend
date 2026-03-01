import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

// Extend Request interface to include user and restaurantId
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        full_name?: string;
        role?: string;
      };
      restaurantId?: string;
    }
  }
}

// Supabase client - using SERVICE key for both auth and database operations
// Note: ANON key was invalid in our setup, SERVICE key works for JWT validation
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Middleware to authenticate JWT token with AdaAuth integration
 * Validates the Bearer token and adds user info to request
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({
        error: "MISSING_TOKEN",
        message: "Access token is required",
        hint: "Include 'Authorization: Bearer <token>' header"
      });
    }

    // Validate token with Supabase (using SERVICE key - ANON key was invalid)
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      return res.status(401).json({
        error: "INVALID_TOKEN",
        message: "Invalid or expired access token"
      });
    }

    // Get user profile from auth_users table
    const { data: userProfile, error: profileError } = await supabase
      .from('auth_users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      console.error("Failed to get user profile:", profileError);
      return res.status(401).json({
        error: "USER_PROFILE_NOT_FOUND",
        message: "User profile not found"
      });
    }

    // Add user info to request
    req.user = {
      id: data.user.id,
      email: data.user.email || userProfile.email,
      full_name: userProfile.full_name,
      role: userProfile.role
    };

    next();
  } catch (error: any) {
    console.error("Token validation error:", error);
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "Authentication failed"
    });
  }
};

/**
 * Middleware to check if user has access to specific restaurant
 */
export const requireRestaurantAccess = (restaurantIdParam: string = 'restaurantId') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Authentication required"
        });
      }

      const restaurantId = req.params[restaurantIdParam];
      
      if (!restaurantId) {
        return res.status(400).json({
          error: "MISSING_RESTAURANT_ID",
          message: "Restaurant ID is required in URL parameters"
        });
      }

      // Check if user has access to this restaurant
      const { data: access, error } = await supabase
        .from('user_restaurant_access')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('restaurant_id', restaurantId)
        .eq('active', true)
        .single();

      if (error || !access) {
        return res.status(403).json({
          error: "RESTAURANT_ACCESS_DENIED",
          message: "You don't have access to this restaurant"
        });
      }

      // Add restaurant ID to request for convenience
      req.restaurantId = restaurantId;
      next();
    } catch (error: any) {
      console.error("Restaurant access check error:", error);
      return res.status(500).json({
        error: "ACCESS_CHECK_FAILED",
        message: "Failed to verify restaurant access"
      });
    }
  };
};

/**
 * Middleware to check if user is owner of restaurant
 */
export const requireOwner = (restaurantIdParam: string = 'restaurantId') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Authentication required"
        });
      }

      const restaurantId = req.params[restaurantIdParam];

      if (!restaurantId) {
        return res.status(400).json({
          error: "MISSING_RESTAURANT_ID",
          message: "Restaurant ID is required"
        });
      }

      const { data: access, error } = await supabase
        .from('user_restaurant_access')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('restaurant_id', restaurantId)
        .eq('active', true)
        .single();

      if (error || !access || access.role !== 'owner') {
        return res.status(403).json({
          error: "OWNER_ACCESS_DENIED",
          message: "Cette action est réservée aux propriétaires du restaurant"
        });
      }

      req.restaurantId = restaurantId;
      next();
    } catch (error: any) {
      console.error("Owner access check error:", error);
      return res.status(500).json({
        error: "ACCESS_CHECK_FAILED",
        message: "Failed to verify owner access"
      });
    }
  };
};

/**
 * Middleware to check if user is manager or owner of restaurant
 */
export const requireStaffManagement = (restaurantIdParam: string = 'restaurantId') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Authentication required"
        });
      }

      const restaurantId = req.params[restaurantIdParam];
      
      if (!restaurantId) {
        return res.status(400).json({
          error: "MISSING_RESTAURANT_ID",
          message: "Restaurant ID is required"
        });
      }

      // Check if user has management access to this restaurant
      const { data: access, error } = await supabase
        .from('user_restaurant_access')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('restaurant_id', restaurantId)
        .eq('active', true)
        .single();

      if (error || !access || !['owner', 'manager'].includes(access.role)) {
        return res.status(403).json({
          error: "STAFF_MANAGEMENT_DENIED",
          message: "You need manager or owner permissions to manage staff"
        });
      }

      req.restaurantId = restaurantId;
      next();
    } catch (error: any) {
      console.error("Staff management check error:", error);
      return res.status(500).json({
        error: "MANAGEMENT_CHECK_FAILED",
        message: "Failed to verify management access"
      });
    }
  };
};