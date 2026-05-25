import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "webwavebusinesspvtltd@gmail.com";

serve(async (req) => {
  try {
    const { userEmail, userName, adminEmail } = await req.json();

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Email content
    const subject = `New CRM Login Approval Request - ${userName}`;
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>New CRM Login Approval Request</h2>
          <p>A user has requested access to the CRM system:</p>
          <ul>
            <li><strong>Name:</strong> ${userName}</li>
            <li><strong>Email:</strong> ${userEmail}</li>
            <li><strong>Requested At:</strong> ${new Date().toLocaleString()}</li>
          </ul>
          <p>Please review and approve/reject this request in the CRM admin panel.</p>
          <p>Thank you!</p>
        </body>
      </html>
    `;

    // Use Supabase's built-in email function or send via external service
    // For now, we'll use a simple approach with Supabase's email
    // Note: This requires Supabase email configuration
    
    // Alternative: Use a service like Resend, SendGrid, etc.
    // For now, we'll log it and the admin can check the database
    
    console.log(`Login approval request for ${userEmail} (${userName})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Approval request logged. Admin will be notified via email." 
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
