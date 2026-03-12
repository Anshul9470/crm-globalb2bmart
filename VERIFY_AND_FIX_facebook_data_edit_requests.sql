-- STEP 1: Check if table exists
-- Run this first to verify

SELECT 
  table_name,
  table_schema
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'facebook_data_edit_requests';

-- If the query above returns NO ROWS, the table doesn't exist. Run STEP 2 below.
-- If it returns a row, the table exists but schema cache might need refresh. Skip to STEP 3.

-- ============================================================================
-- STEP 2: Create the table (only if STEP 1 returned no rows)
-- ============================================================================

-- First, ensure function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the table
CREATE TABLE IF NOT EXISTS public.facebook_data_edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  facebook_data_share_id UUID REFERENCES public.facebook_data_shares(id) ON DELETE CASCADE NOT NULL,
  requested_by_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  request_message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.facebook_data_edit_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Employees can view their own edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Employees can create edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Admins can update edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Admins can delete edit requests" ON public.facebook_data_edit_requests;

-- Create indexes
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_facebook_data_edit_requests_requested_by') THEN
    CREATE INDEX idx_facebook_data_edit_requests_requested_by ON public.facebook_data_edit_requests(requested_by_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_facebook_data_edit_requests_facebook_data_id') THEN
    CREATE INDEX idx_facebook_data_edit_requests_facebook_data_id ON public.facebook_data_edit_requests(facebook_data_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_facebook_data_edit_requests_status') THEN
    CREATE INDEX idx_facebook_data_edit_requests_status ON public.facebook_data_edit_requests(status);
  END IF;
END $$;

-- Create trigger
DROP TRIGGER IF EXISTS update_facebook_data_edit_requests_updated_at ON public.facebook_data_edit_requests;
CREATE TRIGGER update_facebook_data_edit_requests_updated_at
  BEFORE UPDATE ON public.facebook_data_edit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create RLS Policies
CREATE POLICY "Employees can view their own edit requests"
  ON public.facebook_data_edit_requests FOR SELECT
  TO authenticated
  USING (
    requested_by_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Employees can create edit requests"
  ON public.facebook_data_edit_requests FOR INSERT
  TO authenticated
  WITH CHECK (requested_by_id = auth.uid());

CREATE POLICY "Admins can update edit requests"
  ON public.facebook_data_edit_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete edit requests"
  ON public.facebook_data_edit_requests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- STEP 3: Refresh Schema Cache (if table exists but still getting 404)
-- ============================================================================

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verify table was created successfully
SELECT 
  '✅ Table exists!' as status,
  table_name,
  (SELECT COUNT(*) FROM public.facebook_data_edit_requests) as row_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'facebook_data_edit_requests';

