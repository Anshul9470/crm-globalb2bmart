
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixStatus() {
  console.log("Fixing approval status for assigned companies...");
  const { data, error } = await supabase
    .from('companies')
    .update({ approval_status: 'approved' })
    .not('assigned_to_id', 'is', null)
    .or('approval_status.eq.pending,approval_status.is.null');

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Success! Fixed companies.");
  }
}

fixStatus();
