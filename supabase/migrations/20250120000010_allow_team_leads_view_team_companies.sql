-- Allow team leads to view companies assigned to their team members
-- This fixes the issue where team leads can't see employee data when viewing employee dashboards

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view assigned companies" ON public.companies;

-- Create a new policy that allows:
-- 1. Admins to view all companies
-- 2. Team leads to view companies assigned to their team members
-- 3. Users to view companies assigned to them
CREATE POLICY "Users can view assigned companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    -- Admins can view all companies
    public.has_role(auth.uid(), 'admin') OR
    -- Users can view companies assigned to them
    assigned_to_id = auth.uid() OR
    -- Team leads can view companies assigned to their team members
    (
      public.has_role(auth.uid(), 'team_lead') AND
      EXISTS (
        SELECT 1 FROM public.team_members tm
        INNER JOIN public.teams t ON tm.team_id = t.id
        WHERE t.team_lead_id = auth.uid()
        AND tm.employee_id = companies.assigned_to_id
      )
    )
  );

-- Success message
SELECT 'Migration completed successfully! Team leads can now view companies assigned to their team members.' AS message;

