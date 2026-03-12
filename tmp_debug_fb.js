import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("--- Supabase Debug ---");

    // 1. Check current session/user if possible (not easy from node without token)
    // But we can check if table exists and has data

    console.log("\n1. Checking 'facebook_data' table...");
    const { data: fbData, error: fbError, count: fbCount } = await supabase
        .from("facebook_data")
        .select("*", { count: 'exact', head: false });

    if (fbError) {
        console.error("Error fetching facebook_data:", fbError);
    } else {
        console.log(`Success! facebook_data has ${fbCount} total rows.`);
        if (fbData && fbData.length > 0) {
            console.log("Sample ID:", fbData[0].id);
        }
    }

    console.log("\n2. Checking 'user_roles' table...");
    const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select(`
            role,
            profiles:user_id (display_name, email)
        `);

    if (rolesError) {
        console.error("Error fetching roles:", rolesError);
    } else {
        console.log("Found roles:", JSON.stringify(roles, null, 2));
    }
}

debug();
