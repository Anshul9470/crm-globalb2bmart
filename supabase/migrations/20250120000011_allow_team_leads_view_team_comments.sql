-- Allow team leads to view comments on companies assigned to their team members
-- This fixes the issue where team leads can't see comments when viewing employee dashboards

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view comments for their companies" ON public.comments;

-- Create a new policy that allows:
-- 1. Admins to view all comments
-- 2. Team leads to view comments on companies assigned to their team members
-- 3. Users to view comments on companies assigned to them
CREATE POLICY "Users can view comments for their companies"
  ON public.comments FOR SELECT
  TO authenticated
  USING (
    -- Admins can view all comments
    public.has_role(auth.uid(), 'admin') OR
    -- Users can view comments on companies assigned to them
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = comments.company_id
      AND companies.assigned_to_id = auth.uid()
    ) OR
    -- Team leads can view comments on companies assigned to their team members
    (
      public.has_role(auth.uid(), 'team_lead') AND
      EXISTS (
        SELECT 1 FROM public.companies
        INNER JOIN public.team_members tm ON companies.assigned_to_id = tm.employee_id
        INNER JOIN public.teams t ON tm.team_id = t.id
        WHERE companies.id = comments.company_id
        AND t.team_lead_id = auth.uid()
      )
    )
  );

-- Success message
SELECT 'Migration completed successfully! Team leads can now view comments on companies assigned to their team members.' AS message;

