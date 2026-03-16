
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mqynajstlzzuijgrfigc.supabase.co";
const supabaseKey = "sb_publishable_G9asKro26_s9ERG8UvEfuw_gJ91gdLr";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRam() {
  const query = "ram";
  console.log(`Searching for: ${query}`);
  
  const { data: companies, error: compError } = await supabase
    .from('companies')
    .select('*')
    .or(`company_name.ilike.%${query}%,owner_name.ilike.%${query}%`);
    
  const { data: fb, error: fbError } = await supabase
    .from('facebook_data')
    .select('*')
    .or(`company_name.ilike.%${query}%,owner_name.ilike.%${query}%`);

  console.log("Companies matching 'ram':", companies?.length || 0);
  if (companies && companies.length > 0) {
    console.log("Sample Companies:", companies.map(c => ({ id: c.id, name: c.company_name, status: c.approval_status, assigned: c.assigned_to_id, deleted: c.deleted_at })));
  }

  console.log("Facebook matching 'ram':", fb?.length || 0);
  if (fb && fb.length > 0) {
    console.log("Sample Facebook:", fb.map(f => ({ id: f.id, name: f.company_name, deleted: f.deleted_at, deletion_state: f.deletion_state })));
  }
}

checkRam();
