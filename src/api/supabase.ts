import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase credentials missing! Check your .env file.");
}

console.log("Attempting to connect to:", supabaseUrl);

export const supabase = createClient<any>(supabaseUrl, supabaseKey);