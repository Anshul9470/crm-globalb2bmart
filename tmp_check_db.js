import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Using publishable key might not be enough for schema inspection, but let's try a direct query

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
    console.log("Checking for 'companies' table with joins...");
    const { data, error } = await supabase
        .from("companies")
        .select(`
        *,
        assigned_to:profiles!assigned_to_id(display_name),
        comments (
          id,
          comment_text,
          category,
          comment_date,
          created_at,
          user_id,
          user:profiles!user_id (
            display_name,
            email
          )
        )
      `)
        .is("deleted_at", null)
        .limit(1);

    if (error) {
        console.error("Error from Supabase:", JSON.stringify(error, null, 2));
    } else {
        console.log("Result: Table exists. Data count:", data.length);
        console.log("First item:", JSON.stringify(data[0], null, 2));
    }
}

checkTable();
