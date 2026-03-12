# Facebook Data Comments - Error Fix Guide

## Problem
You were experiencing a 400 error when loading Facebook data. This was caused by attempting to fetch comments using a nested query before the `facebook_data_comments` table was created.

## Solution
The code has been updated to:

1. **Fetch Facebook data first** without comments
2. **Separately fetch comments** if the table exists
3. **Gracefully handle errors** if the comments table doesn't exist yet
4. **Continue without comments** instead of failing completely

## Steps to Fix

### Step 1: Run the Migration
Run the migration to create the comments table:

```bash
# In Supabase Dashboard → SQL Editor, run:
supabase/migrations/20250117000004_create_facebook_data_comments.sql
```

Or manually execute this SQL:

```sql
-- Create facebook_data_comments table
CREATE TABLE IF NOT EXISTS public.facebook_data_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  comment_text TEXT NOT NULL,
  category public.comment_category NOT NULL,
  comment_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.facebook_data_comments ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_facebook_data_comments_facebook_data_id ON public.facebook_data_comments(facebook_data_id);
CREATE INDEX idx_facebook_data_comments_user_id ON public.facebook_data_comments(user_id);
CREATE INDEX idx_facebook_data_comments_created_at ON public.facebook_data_comments(created_at DESC);

-- Add RLS policies (see migration file for full details)
```

### Step 2: Refresh Your Browser
After running the migration, refresh your browser. The data should load without errors.

### Step 3: Verify
- Facebook data should load successfully
- Comments functionality will be available once the table is created
- Before the table exists, data loads but comments are not available (this is expected)

## What Changed in the Code

1. **Separate Queries**: Instead of nested queries, we now fetch data and comments separately
2. **Error Handling**: Comments fetch errors don't prevent data from loading
3. **Graceful Degradation**: If comments table doesn't exist, the app continues without comments

## Current Status

✅ Data fetching is now error-tolerant
✅ Comments can be added after migration is run
✅ No breaking errors if comments table doesn't exist yet

## If You Still See Errors

1. Check browser console for detailed error messages
2. Verify the `facebook_data` table exists and is accessible
3. Verify RLS policies on `facebook_data` table allow access
4. Run the migration if you haven't already

