import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://osxxmmutwehabkvylkki.supabase.co';
const supabaseKey = 'sb_publishable_gz-nZ6AqOiz8dXF3TVkXoQ_TBceFTXW';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
