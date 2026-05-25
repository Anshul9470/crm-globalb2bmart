-- Fix RLS policy for comments table to allow employees to insert SEO category comments
-- This allows SEO/Website employees to mark tasks as complete by inserting completion comments
-- Run this in Supabase SQL Editor

-- Step 1: Ensure the helper function exists (from fix_seo_comments_rls.sql)
CREATE OR REPLACE FUNCTION public.has_seo_comment(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.comments
    WHERE company_id = _company_id
    AND category = 'seo'
  );
$$;

-- Step 2: Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can insert comments for their companies" ON public.comments;

-- Step 3: Create a new INSERT policy that allows:
-- 1. Admins to insert comments on any company
-- 2. Employees/Team Leads to insert comments on companies assigned to them
-- 3. Employees to insert comments with category 'seo' (for task completion)
--    - We check if the company has existing SEO comments OR if the comment text starts with "TASK_COMPLETED:"
--    - This allows employees to mark tasks as complete
CREATE POLICY "Users can insert comments for their companies"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    (
      -- Admins can insert comments on any company
      public.has_role(auth.uid(), 'admin') OR
      -- Employees/Team Leads can insert comments on companies assigned to them
      EXISTS (
        SELECT 1 FROM public.companies
        WHERE companies.id = company_id
        AND companies.assigned_to_id = auth.uid()
      ) OR
      -- Employees can insert comments with category 'seo'
      -- This allows SEO/Website employees to mark tasks as complete
      -- We allow it if:
      --   a) The company has existing SEO comments (task was assigned), OR
      --   b) The comment text starts with "TASK_COMPLETED:" (completion comment)
      (
        public.has_role(auth.uid(), 'employee') AND
        category = 'seo' AND
        (
          public.has_seo_comment(company_id) OR
          comment_text LIKE 'TASK_COMPLETED:%'
        )
      )
    )
  );

-- Step 4: Verify the policy was created
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
WHERE tablename = 'comments' AND policyname = 'Users can insert comments for their companies';

-- Success message
SELECT 'Migration completed successfully! Employees can now insert SEO category comments to mark tasks as complete.' AS message;

