
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mqynajstlzzuijgrfigc.supabase.co";
const supabaseKey = "sb_publishable_G9asKro26_s9ERG8UvEfuw_gJ91gdLr";
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { count: fbCount, error: fbError } = await supabase
    .from('facebook_data')
    .select('*', { count: 'exact', head: true });
    
  const { count: compCount, error: compError } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true });

  console.log('FB Count:', fbCount, 'Error:', fbError);
  console.log('Comp Count:', compCount, 'Error:', compError);
}

test();
