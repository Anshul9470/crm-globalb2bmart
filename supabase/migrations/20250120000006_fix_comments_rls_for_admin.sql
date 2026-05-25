-- Fix RLS policy for comments table to allow admins to insert comments on any company
-- This fixes the issue where admins couldn't add comments in Paid Client Pool section

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can insert comments for their companies" ON public.comments;

-- Create a new INSERT policy that allows:
-- 1. Admins to insert comments on any company
-- 2. Employees/Team Leads to insert comments on companies assigned to them
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
      )
    )
  );

-- Success message
SELECT 'Migration completed successfully! Admins can now insert comments on any company.' AS message;

