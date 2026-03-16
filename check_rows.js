
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mqynajstlzzuijgrfigc.supabase.co";
const supabaseKey = "sb_publishable_G9asKro26_s9ERG8UvEfuw_gJ91gdLr";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRows() {
  console.log("Checking row count returned by standard select...");
  
  const { data, error } = await supabase
    .from('companies')
    .select('*');

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Rows returned:", data.length);
  }
}

checkRows();
