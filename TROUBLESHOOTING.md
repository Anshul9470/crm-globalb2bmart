# Troubleshooting Supabase Connection Issues

## Error: `ERR_NAME_NOT_RESOLVED` or `Failed to fetch`

This error indicates that your application cannot connect to Supabase. Here are the steps to fix it:

### 1. Check Environment Variables

Create a `.env` file in the root of your project with the following:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-public-key-here
```

**To get these values:**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to Settings → API
4. Copy the "Project URL" (this is your `VITE_SUPABASE_URL`)
5. Copy the "anon public" key (this is your `VITE_SUPABASE_PUBLISHABLE_KEY`)

### 2. Verify Your Supabase Project Status

- Check if your Supabase project is **paused** (free tier projects pause after inactivity)
- If paused, go to your Supabase dashboard and click "Restore project"
- Wait a few minutes for the project to restore

### 3. Check Network Connectivity

- Ensure you have an active internet connection
- Check if you can access `https://app.supabase.com` in your browser
- Try accessing your Supabase project URL directly in the browser

### 4. Restart Development Server

After updating `.env` file:
1. Stop your development server (Ctrl+C)
2. Delete `.env` if it exists and recreate it
3. Restart: `npm run dev`

### 5. Clear Browser Cache

- Clear your browser's localStorage (where Supabase stores auth tokens)
- Open browser DevTools → Application → Local Storage → Clear all
- Refresh the page

### 6. Verify Project ID

The error shows: `tupbjxbmphgvqlvnerpj.supabase.co`

Make sure:
- This project ID matches your actual Supabase project
- The project is not deleted or archived
- You have access to this project

### 7. Check Supabase Project Settings

In your Supabase dashboard:
- Go to Settings → API
- Verify the project URL is correct
- Check if API access is enabled
- Verify there are no IP restrictions blocking your connection

### 8. Common Issues

**Issue:** Project is paused
- **Solution:** Restore the project from Supabase dashboard

**Issue:** Wrong project ID
- **Solution:** Update `.env` with correct project URL

**Issue:** Missing environment variables
- **Solution:** Create `.env` file with correct values

**Issue:** CORS errors
- **Solution:** Check Supabase project settings for allowed origins

### Still Having Issues?

1. Check the browser console for more detailed error messages
2. Verify your Supabase project is active in the dashboard
3. Try creating a new Supabase project and updating the `.env` file
4. Contact Supabase support if the project appears to be deleted
