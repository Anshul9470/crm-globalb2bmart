-- Ensure RLS is enabled on facebook_data table
ALTER TABLE public.facebook_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Admins can view all facebook data" ON public.facebook_data;
DROP POLICY IF EXISTS "Admins can insert facebook data" ON public.facebook_data;
DROP POLICY IF EXISTS "Admins can update facebook data" ON public.facebook_data;
DROP POLICY IF EXISTS "Admins can delete facebook data" ON public.facebook_data;
DROP POLICY IF EXISTS "Authenticated users can view facebook data" ON public.facebook_data;

-- Policy: Allow all authenticated users to view Facebook data
-- This is more permissive for easier access - you can restrict later
CREATE POLICY "Authenticated users can view facebook data"
  ON public.facebook_data FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Admins can insert Facebook data
CREATE POLICY "Admins can insert facebook data"
  ON public.facebook_data FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
  );

-- Policy: Admins can update Facebook data
CREATE POLICY "Admins can update facebook data"
  ON public.facebook_data FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  );

-- Policy: Admins can delete Facebook data
CREATE POLICY "Admins can delete facebook data"
  ON public.facebook_data FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  );
