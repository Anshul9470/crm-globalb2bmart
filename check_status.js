
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mqynajstlzzuijgrfigc.supabase.co";
const supabaseKey = "sb_publishable_G9asKro26_s9ERG8UvEfuw_gJ91gdLr";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('companies').select('approval_status, phone').limit(10);
  console.log('Status and Phone sample:', data);
  if (error) console.error(error);
}

check();
