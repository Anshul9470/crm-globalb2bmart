-- Allow employees to view teams table to check team_lead_id
-- This is needed so employees can determine if they have a team lead when deleting data
-- Without this, employees can't check if data should go to team_lead_recycle or admin_recycle

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Employees can view teams they belong to" ON public.teams;

-- Policy: Allow employees to view teams they belong to (to check team_lead_id)
CREATE POLICY "Employees can view teams they belong to"
  ON public.teams FOR SELECT
  TO authenticated
  USING (
    -- Allow if user is an employee in this team
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = teams.id
      AND team_members.employee_id = auth.uid()
    ) OR
    -- Or if they're an admin or team lead (existing permissions)
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'team_lead')
  );

-- Success message
SELECT 'Migration completed successfully! Employees can now view teams they belong to.' AS message;

