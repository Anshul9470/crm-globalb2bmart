
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mqynajstlzzuijgrfigc.supabase.co";
const supabaseKey = "sb_publishable_G9asKro26_s9ERG8UvEfuw_gJ91gdLr"; // This is usually a public key, hopefully it works for reading

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPhone() {
  const phone = "9443864464";
  console.log(`Searching for phone containing: ${phone}`);
  
  const { data: companies, error: compError } = await supabase
    .from('companies')
    .select('*')
    .ilike('phone', `%${phone}`);
    
  const { data: fb, error: fbError } = await supabase
    .from('facebook_data')
    .select('*')
    .ilike('phone', `%${phone}`);

  console.log("Companies match:", companies?.length || 0);
  console.log("Facebook match:", fb?.length || 0);
  
  if (fb && fb.length > 0) {
    console.log("First FB match details:", JSON.stringify(fb[0], null, 2));
  }
}

checkPhone();
