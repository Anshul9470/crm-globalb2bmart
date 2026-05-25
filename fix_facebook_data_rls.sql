-- Fix Facebook Data RLS Access
-- This allows authenticated users to view facebook_data table

-- Step 1: Enable RLS (if not already enabled)
ALTER TABLE public.facebook_data ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to view facebook data" ON public.facebook_data;

-- Step 3: Create policy to allow all authenticated users to view all Facebook data
CREATE POLICY "Allow authenticated users to view facebook data"
  ON public.facebook_data
  FOR SELECT
  TO authenticated
  USING (true);

-- Verify: Check if policy was created
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'facebook_data';
