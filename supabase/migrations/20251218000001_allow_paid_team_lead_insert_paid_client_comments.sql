-- Allow paid team leads to insert comments for paid clients (satisfaction + general notes + SEO send notes)
-- Fixes: 403 / RLS violation when PaidClientPoolView inserts "SATISFACTION_STATUS:" comments.

-- 1) Ensure app_role enum contains 'paid_team_lead' (frontend already uses this role)
DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE 'paid_team_lead';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Helper: identify whether a company belongs to the Paid Client Pool.
-- We avoid direct references to companies.is_paid (may not exist in some DBs) by using dynamic SQL.
CREATE OR REPLACE FUNCTION public.is_paid_client_company(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_is_paid_column BOOLEAN;
  is_paid_value BOOLEAN;
BEGIN
  -- If companies.is_paid exists, prefer it
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'is_paid'
  ) INTO has_is_paid_column;

  IF has_is_paid_column THEN
    EXECUTE 'SELECT is_paid FROM public.companies WHERE id = $1' INTO is_paid_value USING _company_id;
    IF COALESCE(is_paid_value, FALSE) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Fallback: company is "paid" if it has a paid comment marker
  RETURN EXISTS (
    SELECT 1
    FROM public.comments
    WHERE company_id = _company_id
      AND category = 'paid'
  );
END;
$$;

-- 3) Extend INSERT policy on public.comments:
--    - Keep existing rules (admin, assigned companies, SEO employee completion rules)
--    - Add paid_team_lead: can insert comments for paid-client companies (category limited)
DROP POLICY IF EXISTS "Users can insert comments for their companies" ON public.comments;

CREATE POLICY "Users can insert comments for their companies"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    (
      -- Admins can insert comments on any company
      public.has_role(auth.uid(), 'admin') OR

      -- Users can insert comments on companies assigned to them
      EXISTS (
        SELECT 1 FROM public.companies
        WHERE companies.id = company_id
          AND companies.assigned_to_id = auth.uid()
      ) OR

      -- Paid team leads can insert comments for paid-client companies
      -- (satisfaction markers, paid notes, and SEO send notes)
      (
        (public.has_role(auth.uid(), 'paid_team_lead') OR public.has_role(auth.uid(), 'team_lead')) AND
        public.is_paid_client_company(company_id) AND
        category IN ('paid', 'general', 'seo')
      ) OR

      -- Employees can insert comments with category 'seo' to mark tasks as complete
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


