
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://mqynajstlzzuijgrfigc.supabase.co";
const supabaseKey = "sb_publishable_G9asKro26_s9ERG8UvEfuw_gJ91gdLr";
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    try {
        const { data: companies, error: ce } = await supabase.from('companies').select('*').limit(1);
        console.log('Companies columns:', Object.keys(companies?.[0] || {}));
        
        const { data: fb, error: fe } = await supabase.from('facebook_data').select('*').limit(1);
        console.log('Facebook columns:', Object.keys(fb?.[0] || {}));
    } catch (e) {
        console.error(e);
    }
}
inspect();
