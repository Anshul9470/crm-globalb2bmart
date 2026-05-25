-- First, verify if the table exists
SELECT 
    table_name,
    table_schema
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'facebook_data_edit_requests';

-- If the above returns no rows, the table doesn't exist. Run the script below:

-- ============================================
-- CREATE TABLE SCRIPT (Run this if table doesn't exist)
-- ============================================

-- Create function to update updated_at timestamp (if it doesn't exist)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop table if it exists (CAREFUL: This will delete all data!)
-- DROP TABLE IF EXISTS public.facebook_data_edit_requests CASCADE;

-- Create facebook_data_edit_requests table to track edit requests from employees
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Fields for employee-submitted data
  company_name TEXT,
  owner_name TEXT,
  phone TEXT,
  email TEXT,
  products TEXT,
  services TEXT
);

-- Enable RLS
ALTER TABLE public.facebook_data_edit_requests ENABLE ROW LEVEL SECURITY;

-- Add columns if they don't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'facebook_data_edit_requests' 
                 AND column_name = 'company_name') THEN
    ALTER TABLE public.facebook_data_edit_requests ADD COLUMN company_name TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'facebook_data_edit_requests' 
                 AND column_name = 'owner_name') THEN
    ALTER TABLE public.facebook_data_edit_requests ADD COLUMN owner_name TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'facebook_data_edit_requests' 
                 AND column_name = 'phone') THEN
    ALTER TABLE public.facebook_data_edit_requests ADD COLUMN phone TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'facebook_data_edit_requests' 
                 AND column_name = 'email') THEN
    ALTER TABLE public.facebook_data_edit_requests ADD COLUMN email TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'facebook_data_edit_requests' 
                 AND column_name = 'products') THEN
    ALTER TABLE public.facebook_data_edit_requests ADD COLUMN products TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'facebook_data_edit_requests' 
                 AND column_name = 'services') THEN
    ALTER TABLE public.facebook_data_edit_requests ADD COLUMN services TEXT;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_requested_by ON public.facebook_data_edit_requests(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_facebook_data_id ON public.facebook_data_edit_requests(facebook_data_id);
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_status ON public.facebook_data_edit_requests(status);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_facebook_data_edit_requests_updated_at ON public.facebook_data_edit_requests;
CREATE TRIGGER update_facebook_data_edit_requests_updated_at
  BEFORE UPDATE ON public.facebook_data_edit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Employees can view their own edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Employees can create edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Admins can update edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Admins can delete edit requests" ON public.facebook_data_edit_requests;

-- Employees can view their own edit requests
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

-- Employees can create edit requests
CREATE POLICY "Employees can create edit requests"
  ON public.facebook_data_edit_requests FOR INSERT
  TO authenticated
  WITH CHECK (requested_by_id = auth.uid());

-- Only admins can update edit requests (approve/reject)
CREATE POLICY "Admins can update edit requests"
  ON public.facebook_data_edit_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete edit requests
CREATE POLICY "Admins can delete edit requests"
  ON public.facebook_data_edit_requests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Verify the table was created successfully
SELECT 
    'Table created successfully!' as status,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'facebook_data_edit_requests';

