import { createClient } from "@supabase/supabase-js";

// TODO: Configure Supabase connection
export const getSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration missing");
  }
  
  return createClient(supabaseUrl, supabaseKey);
};