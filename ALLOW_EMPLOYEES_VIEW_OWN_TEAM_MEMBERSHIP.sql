-- Allow employees to view their own team membership
-- This is needed so employees can check if they're in a team when deleting data
-- Without this, employees can't determine if data should go to team_lead_recycle or admin_recycle
-- Run this in Supabase SQL Editor

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Employees can view their own team membership" ON public.team_members;

-- Policy: Allow employees to view their own team membership
CREATE POLICY "Employees can view their own team membership"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (
    -- Allow if user is viewing their own team membership
    employee_id = auth.uid() OR
    -- Or if they're an admin or team lead (existing permissions)
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'team_lead')
  );

-- Success message
SELECT 'Migration completed successfully! Employees can now view their own team membership.' AS message;

