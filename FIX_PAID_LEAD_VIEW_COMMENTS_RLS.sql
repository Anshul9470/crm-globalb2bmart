-- Fix: Paid Team Lead can insert satisfaction comments but cannot SEE them,
-- so Satisfied/Average/Dissatisfied sections remain empty.
--
-- Run this in Supabase SQL Editor if you are not running migrations automatically.

DROP POLICY IF EXISTS "Users can view comments for their companies" ON public.comments;

CREATE POLICY "Users can view comments for their companies"
  ON public.comments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    -- Regular employees: can only see THEIR OWN comments on companies assigned to them
    (
      NOT (public.has_role(auth.uid(), 'team_lead') OR public.has_role(auth.uid(), 'paid_team_lead'))
      AND EXISTS (
        SELECT 1 FROM public.companies
        WHERE companies.id = comments.company_id
        AND companies.assigned_to_id = auth.uid()
      )
      -- employee can only see comments they themselves wrote
      AND comments.user_id = auth.uid()
    ) OR
    -- Paid Team Lead can view comments for paid-client companies (required for Satisfaction sections)
    (
      public.has_role(auth.uid(), 'paid_team_lead') AND
      public.is_paid_client_company(comments.company_id)
    ) OR
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

-- Verify policy exists
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname='public'
  AND tablename='comments'
  AND policyname='Users can view comments for their companies';


