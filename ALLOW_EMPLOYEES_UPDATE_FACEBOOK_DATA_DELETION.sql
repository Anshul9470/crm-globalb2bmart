-- Allow employees to update deletion_state, deleted_at, and deleted_by_id columns
-- This is needed for the multi-stage deletion workflow (inactive -> team_lead_recycle -> admin_recycle)
-- Run this in Supabase SQL Editor

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Employees can update facebook data deletion state" ON public.facebook_data;

-- Policy: Allow employees to update deletion_state, deleted_at, and deleted_by_id
-- This allows employees to move data from inactive to team_lead_recycle
CREATE POLICY "Employees can update facebook data deletion state"
  ON public.facebook_data FOR UPDATE
  TO authenticated
  USING (
    -- Allow if user is an employee, team_lead, or admin
    public.has_role(auth.uid(), 'employee') OR
    public.has_role(auth.uid(), 'team_lead') OR
    public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    -- Only allow updating deletion_state, deleted_at, and deleted_by_id columns
    -- This prevents employees from modifying other sensitive data
    (
      public.has_role(auth.uid(), 'employee') OR
      public.has_role(auth.uid(), 'team_lead') OR
      public.has_role(auth.uid(), 'admin')
    )
  );

-- Success message
SELECT 'Migration completed successfully! Employees can now update deletion_state, deleted_at, and deleted_by_id columns.' AS message;

