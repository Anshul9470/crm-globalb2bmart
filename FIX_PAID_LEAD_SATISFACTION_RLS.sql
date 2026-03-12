-- Fix: Paid Team Lead cannot insert satisfaction comments (403 / RLS violation on public.comments)
--
-- Run this in Supabase SQL Editor if you are not running migrations automatically.

-- 1) Ensure app_role enum contains 'paid_team_lead'
DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE 'paid_team_lead';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Helper: identify paid-client companies
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

  RETURN EXISTS (
    SELECT 1
    FROM public.comments
    WHERE company_id = _company_id
      AND category = 'paid'
  );
END;
$$;

-- 3) Update INSERT policy for comments to allow paid_team_lead for paid clients
DROP POLICY IF EXISTS "Users can insert comments for their companies" ON public.comments;

CREATE POLICY "Users can insert comments for their companies"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    (
      public.has_role(auth.uid(), 'admin') OR
      EXISTS (
        SELECT 1 FROM public.companies
        WHERE companies.id = company_id
          AND companies.assigned_to_id = auth.uid()
      ) OR
      (
        (public.has_role(auth.uid(), 'paid_team_lead') OR public.has_role(auth.uid(), 'team_lead')) AND
        public.is_paid_client_company(company_id) AND
        category IN ('paid', 'general', 'seo')
      ) OR
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

-- Optional: verify policy exists
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'comments'
  AND policyname = 'Users can insert comments for their companies';

-- Optional: verify your paid lead user has the right role
-- Replace the email with your paid lead email if needed.
SELECT p.email, ur.role
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id
WHERE p.email IN ('vishakha@company.com')
ORDER BY p.email, ur.role;


