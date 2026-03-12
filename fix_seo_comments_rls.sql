-- Fix RLS policies to allow SEO/Website employees to view SEO comments and related company data
-- This allows employees to see tasks sent from Paid Team Leads
-- Uses SECURITY DEFINER function to avoid infinite recursion

-- 1. Create a helper function to check if a company has SEO comments (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_seo_comment(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.comments
    WHERE company_id = _company_id
    AND category = 'seo'
  );
$$;

-- 2. Update comments SELECT policy to allow employees to view SEO category comments
DROP POLICY IF EXISTS "Users can view comments for their companies" ON public.comments;

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
    ) OR
    -- Employees can view comments with category 'seo' (SEO/Website tasks)
    (
      public.has_role(auth.uid(), 'employee') AND
      comments.category = 'seo'
    )
  );

-- 3. Update companies SELECT policy to allow employees to view companies that have SEO comments
-- Use the SECURITY DEFINER function to avoid recursion
DROP POLICY IF EXISTS "Users can view assigned companies" ON public.companies;

CREATE POLICY "Users can view assigned companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    -- Admins can view all companies
    public.has_role(auth.uid(), 'admin') OR
    -- Users can view companies assigned to them
    assigned_to_id = auth.uid() OR
    -- Employees can view companies that have SEO comments (for SEO/Website tasks)
    -- Use SECURITY DEFINER function to avoid infinite recursion
    (
      public.has_role(auth.uid(), 'employee') AND
      public.has_seo_comment(companies.id)
    )
  );

-- Success message
SELECT 'Migration completed successfully! SEO/Website employees can now view SEO tasks.' AS message;

