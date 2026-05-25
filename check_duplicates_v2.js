
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mqynajstlzzuijgrfigc.supabase.co";
const supabaseKey = "sb_publishable_G9asKro26_s9ERG8UvEfuw_gJ91gdLr";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Test if we can see ANY data in companies
  const { data: anyComp } = await supabase.from('companies').select('id').limit(1);
  console.log('Can see companies?', anyComp ? 'Yes' : 'No');

  // Check pending duplicates
  const { data: pendingWithPhone } = await supabase
    .from('companies')
    .select('phone')
    .or('approval_status.eq.pending,approval_status.is.null')
    .is('deleted_at', null)
    .not('phone', 'is', null);

  if (!pendingWithPhone) {
    console.log('Could not fetch pending companies.');
    return;
  }
  
  console.log(`Found ${pendingWithPhone.length} pending companies with phone numbers.`);

  const { data: fbData } = await supabase
    .from('facebook_data')
    .select('phone')
    .is('deleted_at', null);

  if (!fbData) {
    console.log('Could not fetch facebook data.');
    return;
  }

  const fbPhones = new Set(fbData.map(d => d.phone).filter(Boolean));
  const duplicates = pendingWithPhone.filter(c => fbPhones.has(c.phone));

  console.log(`Found ${duplicates.length} pending companies that match a Facebook phone number.`);
}

check();
