import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Database types for staff management
export interface Employee {
  id: string;
  restaurant_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  position: string;
  hourly_rate: number;
  hire_date: string;
  active: boolean;
  availability?: Record<string, any>;
  notes?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  restaurant_id: string;
  employee_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  position: string;
  break_duration_minutes: number;
  status: 'draft' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  notified_at?: string | null;
  // Joined data
  employee?: Pick<Employee, 'first_name' | 'last_name' | 'position'>;
}

export interface ScheduleTemplate {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string;
  template_data: Record<string, any>;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ShiftPreset {
  id: string;
  restaurant_id: string;
  name: string;
  color: string;
  shifts: { start_time: string; end_time: string }[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ClosingPeriod {
  id: string;
  restaurant_id: string;
  name: string;
  date_from: string; // YYYY-MM-DD
  date_to: string;   // YYYY-MM-DD
  comment?: string;
  created_at: string;
  updated_at: string;
}

export class StaffDatabaseService {
  
  /**
   * Initialize database tables if they don't exist
   */
  async initializeTables(): Promise<void> {
    try {
      // Check if employees table exists
      const { data: tables } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', ['employees', 'shifts', 'schedule_templates']);

      const existingTables = tables?.map(t => t.table_name) || [];
      
      console.log('Existing staff tables:', existingTables);
      
      if (!existingTables.includes('employees')) {
        console.log('Creating employees table...');
        await this.createEmployeesTable();
      }
      
      if (!existingTables.includes('shifts')) {
        console.log('Creating shifts table...');
        await this.createShiftsTable();
      }
      
      if (!existingTables.includes('schedule_templates')) {
        console.log('Creating schedule_templates table...');
        await this.createScheduleTemplatesTable();
      }
      
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }
  
  /**
   * Create employees table
   */
  private async createEmployeesTable(): Promise<void> {
    const sql = `
      CREATE TABLE employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(20),
        position VARCHAR(100) NOT NULL,
        hourly_rate DECIMAL(8,2) NOT NULL DEFAULT 0.00,
        hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
        active BOOLEAN NOT NULL DEFAULT true,
        availability JSONB DEFAULT '{}',
        notes TEXT,
        emergency_contact_name VARCHAR(200),
        emergency_contact_phone VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Indexes for performance
      CREATE INDEX idx_employees_restaurant_id ON employees(restaurant_id);
      CREATE INDEX idx_employees_active ON employees(active);
      CREATE INDEX idx_employees_position ON employees(position);
      
      -- Row Level Security
      ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
      
      -- RLS Policy: Users can only access employees from restaurants they have access to
      CREATE POLICY "Users can access employees from their restaurants" ON employees
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM user_restaurant_access 
            WHERE restaurant_id = employees.restaurant_id 
            AND user_id = auth.uid() 
            AND active = true
          )
        );
    `;
    
    await supabase.rpc('exec_sql', { sql });
  }
  
  /**
   * Create shifts table
   */
  private async createShiftsTable(): Promise<void> {
    const sql = `
      CREATE TABLE shifts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        scheduled_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        position VARCHAR(100) NOT NULL,
        break_duration_minutes INTEGER NOT NULL DEFAULT 30,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'confirmed', 'completed', 'cancelled', 'declined')),
        notes TEXT,
        created_by UUID NOT NULL,
        notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Indexes for performance
      CREATE INDEX idx_shifts_restaurant_id ON shifts(restaurant_id);
      CREATE INDEX idx_shifts_employee_id ON shifts(employee_id);
      CREATE INDEX idx_shifts_scheduled_date ON shifts(scheduled_date);
      CREATE INDEX idx_shifts_status ON shifts(status);
      
      -- Row Level Security
      ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
      
      -- RLS Policy: Users can only access shifts from restaurants they have access to
      CREATE POLICY "Users can access shifts from their restaurants" ON shifts
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM user_restaurant_access 
            WHERE restaurant_id = shifts.restaurant_id 
            AND user_id = auth.uid() 
            AND active = true
          )
        );
    `;
    
    await supabase.rpc('exec_sql', { sql });
  }
  
  /**
   * Create schedule templates table
   */
  private async createScheduleTemplatesTable(): Promise<void> {
    const sql = `
      CREATE TABLE schedule_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        template_data JSONB NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Indexes for performance
      CREATE INDEX idx_schedule_templates_restaurant_id ON schedule_templates(restaurant_id);
      CREATE INDEX idx_schedule_templates_active ON schedule_templates(active);
      
      -- Row Level Security
      ALTER TABLE schedule_templates ENABLE ROW LEVEL SECURITY;
      
      -- RLS Policy: Users can only access templates from restaurants they have access to
      CREATE POLICY "Users can access templates from their restaurants" ON schedule_templates
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM user_restaurant_access 
            WHERE restaurant_id = schedule_templates.restaurant_id 
            AND user_id = auth.uid() 
            AND active = true
          )
        );
    `;
    
    await supabase.rpc('exec_sql', { sql });
  }

  // =================== EMPLOYEES ===================
  
  /**
   * Get all employees for a restaurant
   */
  async getEmployees(restaurantId: string, activeOnly: boolean = false): Promise<Employee[]> {
    let query = supabase
      .from('employees')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('first_name');
    
    if (activeOnly) {
      query = query.eq('active', true);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch employees: ${error.message}`);
    }
    
    return data || [];
  }
  
  /**
   * Get employee by ID
   */
  async getEmployeeById(id: string, restaurantId: string): Promise<Employee | null> {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch employee: ${error.message}`);
    }
    
    return data;
  }
  
  /**
   * Create new employee
   */
  async createEmployee(employeeData: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .insert(employeeData)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create employee: ${error.message}`);
    }
    
    return data;
  }
  
  /**
   * Update employee
   */
  async updateEmployee(id: string, restaurantId: string, updates: Partial<Employee>): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update employee: ${error.message}`);
    }
    
    return data;
  }
  
  /**
   * Delete (deactivate) employee
   */
  async deleteEmployee(id: string, restaurantId: string): Promise<void> {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    
    if (error) {
      throw new Error(`Failed to delete employee: ${error.message}`);
    }
  }

  // =================== SHIFTS ===================
  
  /**
   * Get shifts for a date range
   */
  async getShifts(
    restaurantId: string, 
    startDate?: string, 
    endDate?: string, 
    employeeId?: string
  ): Promise<Shift[]> {
    let query = supabase
      .from('shifts')
      .select(`
        *,
        employee:employees(first_name, last_name, position)
      `)
      .eq('restaurant_id', restaurantId)
      .order('scheduled_date')
      .order('start_time');
    
    if (startDate) {
      query = query.gte('scheduled_date', startDate);
    }
    
    if (endDate) {
      query = query.lte('scheduled_date', endDate);
    }
    
    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch shifts: ${error.message}`);
    }
    
    return data || [];
  }
  
  /**
   * Create new shift
   */
  async createShift(shiftData: Omit<Shift, 'id' | 'created_at' | 'updated_at' | 'employee'>): Promise<Shift> {
    const { data, error } = await supabase
      .from('shifts')
      .insert(shiftData)
      .select(`
        *,
        employee:employees(first_name, last_name, position)
      `)
      .single();
    
    if (error) {
      throw new Error(`Failed to create shift: ${error.message}`);
    }
    
    return data;
  }
  
  /**
   * Update shift
   */
  async updateShift(id: string, restaurantId: string, updates: Partial<Shift>): Promise<Shift> {
    const { data, error } = await supabase
      .from('shifts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select(`
        *,
        employee:employees(first_name, last_name, position)
      `)
      .single();
    
    if (error) {
      throw new Error(`Failed to update shift: ${error.message}`);
    }
    
    return data;
  }
  
  /**
   * Mark shifts as notified
   */
  async markShiftsNotified(shiftIds: string[]): Promise<void> {
    const { error } = await supabase
      .from('shifts')
      .update({ notified_at: new Date().toISOString() })
      .in('id', shiftIds);
    
    if (error) {
      // Gracefully handle missing notified_at column — log warning but don't crash
      console.warn(`[markShiftsNotified] Could not update notified_at: ${error.message}`);
    }
  }

  /**
   * Delete shift
   */
  async deleteShift(id: string, restaurantId: string): Promise<void> {
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    
    if (error) {
      throw new Error(`Failed to delete shift: ${error.message}`);
    }
  }

  // =================== SCHEDULE TEMPLATES ===================
  
  /**
   * Get schedule templates
   */
  async getScheduleTemplates(restaurantId: string): Promise<ScheduleTemplate[]> {
    const { data, error } = await supabase
      .from('schedule_templates')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('name');
    
    if (error) {
      throw new Error(`Failed to fetch schedule templates: ${error.message}`);
    }
    
    return data || [];
  }
  
  /**
   * Create schedule template
   */
  async createScheduleTemplate(templateData: Omit<ScheduleTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<ScheduleTemplate> {
    const { data, error } = await supabase
      .from('schedule_templates')
      .insert(templateData)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create schedule template: ${error.message}`);
    }
    
    return data;
  }

  // =================== RESTAURANT SETTINGS ===================

  /**
   * Get restaurant settings (opening hours, schedule rules, info)
   * Uses restaurant_settings table with upsert pattern
   */
  async getRestaurantSettings(restaurantId: string): Promise<Record<string, any>> {
    const { data, error } = await supabase
      .from('restaurant_settings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) {
      // If no settings row exists yet OR table doesn't exist, return defaults
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return {
          restaurant_id: restaurantId,
          opening_hours: {},
          schedule_rules: {
            default_break_minutes: 30,
            max_hours_per_week: 38,
            min_staff_per_service: 2,
            min_rest_days_per_week: 2,
          },
          restaurant_info: {},
        };
      }
      throw new Error(`Failed to fetch restaurant settings: ${error.message}`);
    }

    return data;
  }

  /**
   * Update restaurant settings (upsert — creates if missing)
   */
  async updateRestaurantSettings(
    restaurantId: string,
    updates: Record<string, any>,
    updatedBy: string
  ): Promise<Record<string, any>> {
    // First try to get existing settings
    const { data: existing } = await supabase
      .from('restaurant_settings')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .single();

    const payload: Record<string, any> = {
      restaurant_id: restaurantId,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    if (updates.opening_hours !== undefined) payload.opening_hours = updates.opening_hours;
    if (updates.schedule_rules !== undefined) payload.schedule_rules = updates.schedule_rules;
    if (updates.restaurant_info !== undefined) payload.restaurant_info = updates.restaurant_info;

    let data, error;

    if (existing) {
      // Update existing row
      ({ data, error } = await supabase
        .from('restaurant_settings')
        .update(payload)
        .eq('restaurant_id', restaurantId)
        .select()
        .single());
    } else {
      // Insert new row
      payload.created_at = new Date().toISOString();
      ({ data, error } = await supabase
        .from('restaurant_settings')
        .insert(payload)
        .select()
        .single());
    }

    if (error) {
      throw new Error(`Failed to update restaurant settings: ${error.message}`);
    }

    return data;
  }

  // =================== SHIFT PRESETS ===================

  /**
   * Get all active shift presets for a restaurant
   */
  async getShiftPresets(restaurantId: string): Promise<ShiftPreset[]> {
    const { data, error } = await supabase
      .from('shift_presets')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error) {
      // Table doesn't exist yet — return empty
      if (error.code === '42P01') return [];
      throw new Error(`Failed to fetch shift presets: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a single shift preset by ID
   */
  async getShiftPresetById(id: string, restaurantId: string): Promise<ShiftPreset | null> {
    const { data, error } = await supabase
      .from('shift_presets')
      .select('*')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch shift preset: ${error.message}`);
    }

    return data;
  }

  /**
   * Create a new shift preset
   */
  async createShiftPreset(presetData: Omit<ShiftPreset, 'id' | 'created_at' | 'updated_at'>): Promise<ShiftPreset> {
    const { data, error } = await supabase
      .from('shift_presets')
      .insert(presetData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create shift preset: ${error.message}`);
    }

    return data;
  }

  /**
   * Update a shift preset
   */
  async updateShiftPreset(id: string, restaurantId: string, updates: Partial<ShiftPreset>): Promise<ShiftPreset> {
    const { data, error } = await supabase
      .from('shift_presets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update shift preset: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete (deactivate) a shift preset
   */
  async deleteShiftPreset(id: string, restaurantId: string): Promise<void> {
    const { error } = await supabase
      .from('shift_presets')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);

    if (error) {
      throw new Error(`Failed to delete shift preset: ${error.message}`);
    }
  }

  /**
   * Reorder shift presets
   */
  async reorderShiftPresets(restaurantId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from('shift_presets')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', orderedIds[i])
        .eq('restaurant_id', restaurantId);

      if (error) {
        throw new Error(`Failed to reorder shift presets: ${error.message}`);
      }
    }
  }

  // =================== CLOSING PERIODS ===================

  /**
   * Get all closing periods for a restaurant, ordered by date_from
   */
  async getClosingPeriods(restaurantId: string): Promise<ClosingPeriod[]> {
    const { data, error } = await supabase
      .from('closing_periods')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('date_from');

    if (error) {
      if (error.code === '42P01') return [];
      throw new Error(`Failed to fetch closing periods: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a single closing period by ID
   */
  async getClosingPeriodById(id: string, restaurantId: string): Promise<ClosingPeriod | null> {
    const { data, error } = await supabase
      .from('closing_periods')
      .select('*')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch closing period: ${error.message}`);
    }

    return data;
  }

  /**
   * Create a new closing period
   */
  async createClosingPeriod(data: Omit<ClosingPeriod, 'id' | 'created_at' | 'updated_at'>): Promise<ClosingPeriod> {
    const { data: created, error } = await supabase
      .from('closing_periods')
      .insert(data)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create closing period: ${error.message}`);
    }

    return created;
  }

  /**
   * Update a closing period
   */
  async updateClosingPeriod(id: string, restaurantId: string, updates: Partial<ClosingPeriod>): Promise<ClosingPeriod> {
    const { data, error } = await supabase
      .from('closing_periods')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update closing period: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete a closing period (hard delete)
   */
  async deleteClosingPeriod(id: string, restaurantId: string): Promise<void> {
    const { error } = await supabase
      .from('closing_periods')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId);

    if (error) {
      throw new Error(`Failed to delete closing period: ${error.message}`);
    }
  }

  // =================== RESTAURANT SETTINGS ===================

  /**
   * Initialize restaurant_settings table if it doesn't exist
   */
  async initializeSettingsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS restaurant_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id UUID NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
        opening_hours JSONB NOT NULL DEFAULT '{}',
        schedule_rules JSONB NOT NULL DEFAULT '{"default_break_minutes": 30, "max_hours_per_week": 38, "min_staff_per_service": 2, "min_rest_days_per_week": 2}',
        restaurant_info JSONB NOT NULL DEFAULT '{}',
        updated_by UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Index
      CREATE INDEX IF NOT EXISTS idx_restaurant_settings_restaurant_id ON restaurant_settings(restaurant_id);

      -- Row Level Security
      ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

      -- RLS Policy
      DO $$ BEGIN
        CREATE POLICY "Users can access settings from their restaurants" ON restaurant_settings
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM user_restaurant_access
              WHERE restaurant_id = restaurant_settings.restaurant_id
              AND user_id = auth.uid()
              AND active = true
            )
          );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `;

    await supabase.rpc('exec_sql', { sql });
  }

  // =================== SHIFT RESPONSE TOKENS ===================

  /**
   * Create a shift response token
   */
  async createShiftResponseToken(data: {
    shift_id: string;
    employee_id: string;
    restaurant_id: string;
    token: string;
    expires_at: string;
  }): Promise<{ id: string; token: string }> {
    const { data: created, error } = await supabase
      .from('shift_response_tokens')
      .insert(data)
      .select('id, token')
      .single();

    if (error) {
      throw new Error(`Failed to create shift response token: ${error.message}`);
    }

    return created;
  }

  /**
   * Get a shift response token with shift and employee details
   */
  async getShiftResponseToken(token: string): Promise<{
    id: string;
    shift_id: string;
    employee_id: string;
    restaurant_id: string;
    token: string;
    action: string | null;
    responded_at: string | null;
    expires_at: string;
    created_at: string;
    shift: {
      id: string;
      scheduled_date: string;
      start_time: string;
      end_time: string;
      position: string;
      status: string;
      break_duration_minutes: number;
      restaurant_id: string;
    };
    employee: {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      position: string;
    };
  } | null> {
    const { data, error } = await supabase
      .from('shift_response_tokens')
      .select(`
        *,
        shift:shifts(id, scheduled_date, start_time, end_time, position, status, break_duration_minutes, restaurant_id),
        employee:employees(id, first_name, last_name, email, position)
      `)
      .eq('token', token)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch shift response token: ${error.message}`);
    }

    return data;
  }

  /**
   * Update shift response token with action
   */
  async updateShiftResponseToken(token: string, action: 'accepted' | 'declined'): Promise<void> {
    const { error } = await supabase
      .from('shift_response_tokens')
      .update({
        action,
        responded_at: new Date().toISOString(),
      })
      .eq('token', token);

    if (error) {
      throw new Error(`Failed to update shift response token: ${error.message}`);
    }
  }

  // =================== NOTIFICATIONS ===================

  /**
   * Get notifications for a restaurant (paginated, newest first)
   */
  async getNotifications(
    restaurantId: string,
    options: { limit?: number; offset?: number; unreadOnly?: boolean }
  ): Promise<{ id: string; restaurant_id: string; recipient_user_id: string | null; type: string; title: string; message: string | null; read: boolean; metadata: Record<string, any>; created_at: string }[]> {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options.unreadOnly) {
      query = query.eq('read', false);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch notifications: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create a notification
   */
  async createNotification(data: {
    restaurant_id: string;
    recipient_user_id?: string;
    type: string;
    title: string;
    message?: string;
    metadata?: Record<string, any>;
  }): Promise<{ id: string }> {
    const { data: created, error } = await supabase
      .from('notifications')
      .insert(data)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }

    return created;
  }

  /**
   * Mark a single notification as read
   */
  async markNotificationRead(id: string, restaurantId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);

    if (error) {
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  /**
   * Mark all notifications as read for a restaurant (optionally scoped to a user)
   */
  async markAllNotificationsRead(restaurantId: string, userId?: string): Promise<void> {
    let query = supabase
      .from('notifications')
      .update({ read: true })
      .eq('restaurant_id', restaurantId)
      .eq('read', false);

    if (userId) {
      query = query.eq('recipient_user_id', userId);
    }

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to mark all notifications as read: ${error.message}`);
    }
  }

  /**
   * Get unread notification count for a restaurant
   */
  async getUnreadNotificationCount(restaurantId: string, userId?: string): Promise<number> {
    let query = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('read', false);

    if (userId) {
      query = query.eq('recipient_user_id', userId);
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(`Failed to get unread notification count: ${error.message}`);
    }

    return count || 0;
  }

  // =================== ANALYTICS / LABOR COST ===================

  /**
   * Get labor cost data: join shifts with employees, group by employee and date
   */
  async getLaborCost(
    restaurantId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    shifts: {
      id: string;
      employee_id: string;
      employee_first_name: string;
      employee_last_name: string;
      hourly_rate: number;
      scheduled_date: string;
      start_time: string;
      end_time: string;
      break_duration_minutes: number;
      status: string;
    }[];
  }> {
    const { data, error } = await supabase
      .from('shifts')
      .select(`
        id,
        employee_id,
        scheduled_date,
        start_time,
        end_time,
        break_duration_minutes,
        status,
        employee:employees(first_name, last_name, hourly_rate)
      `)
      .eq('restaurant_id', restaurantId)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .in('status', ['scheduled', 'confirmed', 'completed']);

    if (error) {
      throw new Error(`Failed to fetch labor cost data: ${error.message}`);
    }

    const shifts = (data || []).map((s: any) => ({
      id: s.id,
      employee_id: s.employee_id,
      employee_first_name: s.employee?.first_name || 'Unknown',
      employee_last_name: s.employee?.last_name || '',
      hourly_rate: parseFloat(s.employee?.hourly_rate?.toString() || '0'),
      scheduled_date: s.scheduled_date,
      start_time: s.start_time,
      end_time: s.end_time,
      break_duration_minutes: s.break_duration_minutes,
      status: s.status,
    }));

    return { shifts };
  }

  /**
   * Get restaurant name by ID
   */
  async getRestaurantName(restaurantId: string): Promise<string> {
    const { data, error } = await supabase
      .from('restaurants')
      .select('name')
      .eq('id', restaurantId)
      .single();

    if (error) {
      console.error('Failed to get restaurant name:', error);
      return 'Your Restaurant';
    }

    return data?.name || 'Your Restaurant';
  }

  /**
   * Get managers (owner/manager) for a restaurant to send notifications
   */
  async getRestaurantManagers(restaurantId: string): Promise<{ user_id: string; role: string; email?: string }[]> {
    const { data, error } = await supabase
      .from('user_restaurant_access')
      .select('user_id, role')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .in('role', ['owner', 'manager']);

    if (error) {
      console.error('Failed to get restaurant managers:', error);
      return [];
    }

    // Get emails for each manager
    const managers = [];
    for (const access of data || []) {
      const { data: profile } = await supabase
        .from('auth_users')
        .select('email, full_name')
        .eq('id', access.user_id)
        .single();

      managers.push({
        user_id: access.user_id,
        role: access.role,
        email: profile?.email,
        full_name: profile?.full_name,
      });
    }

    return managers;
  }
}

export const staffDb = new StaffDatabaseService();