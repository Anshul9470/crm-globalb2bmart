-- Complete Fix for Facebook Data RLS Access
-- This script will check, remove conflicting policies, and create the correct one

-- Step 1: Check current RLS status
SELECT 
    tablename, 
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'facebook_data';

-- Step 2: Check existing policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'facebook_data';

-- Step 3: Drop ALL existing policies on facebook_data (clean slate)
DROP POLICY IF EXISTS "Allow authenticated users to view facebook data" ON public.facebook_data;
DROP POLICY IF EXISTS "Admins can view all facebook data" ON public.facebook_data;
DROP POLICY IF EXISTS "Everyone can view facebook data" ON public.facebook_data;
DROP POLICY IF EXISTS "Authenticated users can view facebook data" ON public.facebook_data;

-- Step 4: Enable RLS (should already be enabled, but safe to run)
ALTER TABLE public.facebook_data ENABLE ROW LEVEL SECURITY;

-- Step 5: Create the correct policy (allows all authenticated users)
CREATE POLICY "Allow authenticated users to view facebook data"
  ON public.facebook_data
  FOR SELECT
  TO authenticated
  USING (true);

-- Step 6: Verify the policy was created
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'facebook_data'
ORDER BY policyname;

-- Step 7: Test query (this should show row count)
SELECT COUNT(*) as total_rows FROM public.facebook_data;

-- If you want to temporarily DISABLE RLS for testing (NOT RECOMMENDED FOR PRODUCTION):
-- ALTER TABLE public.facebook_data DISABLE ROW LEVEL SECURITY;

