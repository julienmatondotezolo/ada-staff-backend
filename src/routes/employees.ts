import { Router, Request, Response } from "express";
import { staffDb } from "../lib/database-service";
import { authenticateToken, requireRestaurantAccess, requireOwner } from "../middleware/auth";
import { publicLimiter, adminLimiter } from "../middleware/rate-limit";

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireRestaurantAccess());

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/employees:
 *   get:
 *     summary: Get all employees for the restaurant
 *     description: Retrieve all employees for the authenticated user's restaurant. Requires restaurant access.
 *     tags: [Employee Management]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Restaurant UUID
 *       - in: query
 *         name: active_only
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Filter to only active employees
 *       - in: query
 *         name: position
 *         schema:
 *           type: string
 *         description: Filter by position/role
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of employees
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Employee'
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
    const { active_only, position } = req.query;
    
    // Get employees from database
    let employees = await staffDb.getEmployees(restaurantId, active_only === 'true');
    
    // Filter by position if specified
    if (position && typeof position === 'string') {
      employees = employees.filter(emp => 
        emp.position.toLowerCase().includes(position.toLowerCase())
      );
    }
    
    // Transform for API response
    const employeeList = employees.map(emp => ({
      id: emp.id,
      restaurant_id: emp.restaurant_id,
      name: `${emp.first_name} ${emp.last_name}`,
      first_name: emp.first_name,
      last_name: emp.last_name,
      role: emp.position,
      position: emp.position,
      email: emp.email,
      phone: emp.phone,
      availability: emp.availability || {},
      hourly_rate: parseFloat(emp.hourly_rate.toString()),
      hire_date: emp.hire_date,
      active: emp.active,
      notes: emp.notes,
      emergency_contact: {
        name: emp.emergency_contact_name,
        phone: emp.emergency_contact_phone
      }
    }));

    res.json(employeeList);
  } catch (error: any) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to fetch employees",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/employees:
 *   post:
 *     summary: Add new employee
 *     description: Create a new employee. Requires management access to the restaurant.
 *     tags: [Employee Management]
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
 *             required:
 *               - first_name
 *               - last_name
 *               - position
 *               - hourly_rate
 *             properties:
 *               first_name:
 *                 type: string
 *                 maxLength: 100
 *               last_name:
 *                 type: string
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *                 maxLength: 20
 *               position:
 *                 type: string
 *                 maxLength: 100
 *               hourly_rate:
 *                 type: number
 *                 minimum: 0
 *               hire_date:
 *                 type: string
 *                 format: date
 *               availability:
 *                 type: object
 *               notes:
 *                 type: string
 *               emergency_contact_name:
 *                 type: string
 *                 maxLength: 200
 *               emergency_contact_phone:
 *                 type: string
 *                 maxLength: 20
 *     responses:
 *       201:
 *         description: Employee created successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post("/", requireOwner(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const { 
      first_name, 
      last_name, 
      email, 
      phone, 
      position, 
      hourly_rate, 
      hire_date,
      availability,
      notes,
      emergency_contact_name,
      emergency_contact_phone
    } = req.body;
    
    // Validate required fields
    if (!first_name || !last_name || !position || hourly_rate === undefined) {
      res.status(400).json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "first_name, last_name, position, and hourly_rate are required"
      });
      return;
    }
    
    // Validate hourly_rate is a positive number
    const rate = parseFloat(hourly_rate);
    if (isNaN(rate) || rate < 0) {
      res.status(400).json({
        error: "INVALID_HOURLY_RATE",
        message: "hourly_rate must be a positive number"
      });
      return;
    }
    
    const newEmployee = await staffDb.createEmployee({
      restaurant_id: restaurantId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      position: position.trim(),
      hourly_rate: rate,
      hire_date: hire_date || new Date().toISOString().split('T')[0],
      active: true,
      availability: availability || {},
      notes: notes?.trim(),
      emergency_contact_name: emergency_contact_name?.trim(),
      emergency_contact_phone: emergency_contact_phone?.trim()
    });

    res.status(201).json({
      id: newEmployee.id,
      restaurant_id: newEmployee.restaurant_id,
      name: `${newEmployee.first_name} ${newEmployee.last_name}`,
      first_name: newEmployee.first_name,
      last_name: newEmployee.last_name,
      role: newEmployee.position,
      position: newEmployee.position,
      email: newEmployee.email,
      phone: newEmployee.phone,
      availability: newEmployee.availability,
      hourly_rate: parseFloat(newEmployee.hourly_rate.toString()),
      hire_date: newEmployee.hire_date,
      active: newEmployee.active,
      emergency_contact: {
        name: newEmployee.emergency_contact_name,
        phone: newEmployee.emergency_contact_phone
      },
      created_at: newEmployee.created_at
    });
  } catch (error: any) {
    console.error("Error creating employee:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to create employee",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/employees/{employeeId}:
 *   get:
 *     summary: Get employee by ID
 *     description: Retrieve a specific employee by ID. Requires restaurant access.
 *     tags: [Employee Management]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employee details
 *       404:
 *         description: Employee not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/:employeeId", publicLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, employeeId } = req.params;
    
    const employee = await staffDb.getEmployeeById(employeeId, restaurantId);
    
    if (!employee) {
      res.status(404).json({
        error: "EMPLOYEE_NOT_FOUND",
        message: "Employee not found"
      });
      return;
    }
    
    res.json({
      id: employee.id,
      restaurant_id: employee.restaurant_id,
      name: `${employee.first_name} ${employee.last_name}`,
      first_name: employee.first_name,
      last_name: employee.last_name,
      role: employee.position,
      position: employee.position,
      email: employee.email,
      phone: employee.phone,
      availability: employee.availability,
      hourly_rate: parseFloat(employee.hourly_rate.toString()),
      hire_date: employee.hire_date,
      active: employee.active,
      notes: employee.notes,
      emergency_contact: {
        name: employee.emergency_contact_name,
        phone: employee.emergency_contact_phone
      },
      created_at: employee.created_at,
      updated_at: employee.updated_at
    });
  } catch (error: any) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to fetch employee",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/employees/{employeeId}:
 *   put:
 *     summary: Update employee
 *     description: Update employee information. Requires management access.
 *     tags: [Employee Management]
 */
router.put("/:employeeId", requireOwner(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, employeeId } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.restaurant_id;
    delete updates.created_at;
    
    // Validate hourly_rate if provided
    if (updates.hourly_rate !== undefined) {
      const rate = parseFloat(updates.hourly_rate);
      if (isNaN(rate) || rate < 0) {
        res.status(400).json({
          error: "INVALID_HOURLY_RATE",
          message: "hourly_rate must be a positive number"
        });
        return;
      }
      updates.hourly_rate = rate;
    }
    
    const updatedEmployee = await staffDb.updateEmployee(employeeId, restaurantId, updates);
    
    res.json({
      id: updatedEmployee.id,
      restaurant_id: updatedEmployee.restaurant_id,
      name: `${updatedEmployee.first_name} ${updatedEmployee.last_name}`,
      first_name: updatedEmployee.first_name,
      last_name: updatedEmployee.last_name,
      role: updatedEmployee.position,
      position: updatedEmployee.position,
      email: updatedEmployee.email,
      phone: updatedEmployee.phone,
      availability: updatedEmployee.availability,
      hourly_rate: parseFloat(updatedEmployee.hourly_rate.toString()),
      hire_date: updatedEmployee.hire_date,
      active: updatedEmployee.active,
      notes: updatedEmployee.notes,
      emergency_contact: {
        name: updatedEmployee.emergency_contact_name,
        phone: updatedEmployee.emergency_contact_phone
      },
      updated_at: updatedEmployee.updated_at
    });
  } catch (error: any) {
    console.error("Error updating employee:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to update employee",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/employees/{employeeId}:
 *   delete:
 *     summary: Deactivate employee
 *     description: Deactivate an employee (soft delete). Requires management access.
 *     tags: [Employee Management]
 */
router.delete("/:employeeId", requireOwner(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, employeeId } = req.params;
    
    await staffDb.deleteEmployee(employeeId, restaurantId);
    
    res.json({
      success: true,
      message: "Employee deleted successfully",
      restaurant_id: restaurantId,
      employee_id: employeeId,
    });
  } catch (error: any) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to delete employee",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/v1/restaurants/{restaurantId}/employees/{employeeId}/availability:
 *   put:
 *     summary: Update employee availability
 *     description: Update employee weekly availability schedule. Requires management access.
 *     tags: [Employee Management]
 */
router.put("/:employeeId/availability", requireOwner(), adminLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurantId, employeeId } = req.params;
    const { availability } = req.body;
    
    if (!availability || typeof availability !== 'object') {
      res.status(400).json({
        error: "INVALID_AVAILABILITY",
        message: "availability must be a valid object"
      });
      return;
    }
    
    const updatedEmployee = await staffDb.updateEmployee(employeeId, restaurantId, { 
      availability 
    });
    
    res.json({
      success: true,
      restaurant_id: restaurantId,
      employee_id: employeeId,
      availability: updatedEmployee.availability,
      updated_at: updatedEmployee.updated_at
    });
  } catch (error: any) {
    console.error("Error updating availability:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to update availability",
      details: error.message 
    });
  }
});

export default router;