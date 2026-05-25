-- Allow paid team leads to view comments on companies assigned to their team members
-- Mirrors: 20250120000011_allow_team_leads_view_team_comments.sql but adds paid_team_lead.

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view comments for their companies" ON public.comments;

-- Create a new policy that allows:
-- 1. Admins to view all comments
-- 2. Users to view comments on companies assigned to them
-- 3. Team leads OR paid team leads to view comments on companies assigned to their team members
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
    -- Paid team leads can view comments for paid-client companies
    (
      public.has_role(auth.uid(), 'paid_team_lead') AND
      public.is_paid_client_company(comments.company_id)
    ) OR
    -- Team leads & paid team leads can view comments on companies assigned to their team members
    (
      (public.has_role(auth.uid(), 'team_lead') OR public.has_role(auth.uid(), 'paid_team_lead')) AND
      EXISTS (
        SELECT 1 FROM public.companies
        INNER JOIN public.team_members tm ON companies.assigned_to_id = tm.employee_id
        INNER JOIN public.teams t ON tm.team_id = t.id
        WHERE companies.id = comments.company_id
        AND t.team_lead_id = auth.uid()
      )
    )
  );


