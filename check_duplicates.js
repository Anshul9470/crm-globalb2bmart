
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  // 1. Get all facebook data phone numbers
  const { data: fbData } = await supabase
    .from('facebook_data')
    .select('phone')
    .is('deleted_at', null);
  
  const fbPhones = new Set(fbData.map(d => d.phone).filter(Boolean));
  console.log(`Found ${fbPhones.size} unique phone numbers in facebook_data`);

  // 2. Get pending companies with these phone numbers
  const { data: pendingDuplicates, count } = await supabase
    .from('companies')
    .select('id, company_name, phone', { count: 'exact' })
    .or('approval_status.eq.pending,approval_status.is.null')
    .is('deleted_at', null)
    .in('phone', Array.from(fbPhones));

  if (pendingDuplicates) {
    console.log(`Found ${pendingDuplicates.length} pending companies that are duplicates of Facebook data`);
    console.log('Sample duplicates:', pendingDuplicates.slice(0, 5));
  } else {
    console.log('No pending duplicates found.');
  }
}

checkDuplicates();
