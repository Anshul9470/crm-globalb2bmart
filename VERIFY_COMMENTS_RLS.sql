-- Verification script to check the current RLS policies on comments table
-- Run this to see what policies are currently active

-- Check all policies on comments table
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
WHERE tablename = 'comments'
ORDER BY policyname;

-- Check if has_seo_comment function exists
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name = 'has_seo_comment';

-- Check if has_role function exists
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name = 'has_role';

-- Check comment_category enum values
SELECT 
  t.typname AS enum_name,
  e.enumlabel AS enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname = 'comment_category'
ORDER BY e.enumsortorder;

