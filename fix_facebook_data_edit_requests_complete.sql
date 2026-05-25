-- Complete fix for facebook_data_edit_requests table
-- This script will create the table and all necessary components

-- Step 1: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create the table with all columns
CREATE TABLE IF NOT EXISTS public.facebook_data_edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  facebook_data_share_id UUID NOT NULL,
  requested_by_id UUID NOT NULL,
  request_message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  company_name TEXT,
  owner_name TEXT,
  phone TEXT,
  email TEXT,
  products TEXT,
  services TEXT
);

-- Step 3: Add foreign key constraints (only if referenced tables exist)
DO $$
BEGIN
  -- Check if facebook_data_shares table exists before adding FK
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_name = 'facebook_data_shares') THEN
    -- Drop existing constraint if it exists
    ALTER TABLE public.facebook_data_edit_requests 
    DROP CONSTRAINT IF EXISTS facebook_data_edit_requests_facebook_data_share_id_fkey;
    
    -- Add foreign key constraint
    ALTER TABLE public.facebook_data_edit_requests
    ADD CONSTRAINT facebook_data_edit_requests_facebook_data_share_id_fkey
    FOREIGN KEY (facebook_data_share_id) 
    REFERENCES public.facebook_data_shares(id) 
    ON DELETE CASCADE;
  END IF;
  
  -- Check if profiles table exists before adding FK
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    -- Drop existing constraints if they exist
    ALTER TABLE public.facebook_data_edit_requests 
    DROP CONSTRAINT IF EXISTS facebook_data_edit_requests_requested_by_id_fkey;
    ALTER TABLE public.facebook_data_edit_requests 
    DROP CONSTRAINT IF EXISTS facebook_data_edit_requests_approved_by_id_fkey;
    
    -- Add foreign key constraints
    ALTER TABLE public.facebook_data_edit_requests
    ADD CONSTRAINT facebook_data_edit_requests_requested_by_id_fkey
    FOREIGN KEY (requested_by_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
    
    ALTER TABLE public.facebook_data_edit_requests
    ADD CONSTRAINT facebook_data_edit_requests_approved_by_id_fkey
    FOREIGN KEY (approved_by_id) 
    REFERENCES public.profiles(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Step 4: Enable RLS
ALTER TABLE public.facebook_data_edit_requests ENABLE ROW LEVEL SECURITY;

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_requested_by 
  ON public.facebook_data_edit_requests(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_facebook_data_id 
  ON public.facebook_data_edit_requests(facebook_data_id);
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_status 
  ON public.facebook_data_edit_requests(status);

-- Step 6: Create trigger for updated_at
DROP TRIGGER IF EXISTS update_facebook_data_edit_requests_updated_at 
  ON public.facebook_data_edit_requests;
CREATE TRIGGER update_facebook_data_edit_requests_updated_at
  BEFORE UPDATE ON public.facebook_data_edit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 7: Drop existing policies if they exist
DROP POLICY IF EXISTS "Employees can view their own edit requests" 
  ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Employees can create edit requests" 
  ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Admins can update edit requests" 
  ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Admins can delete edit requests" 
  ON public.facebook_data_edit_requests;

-- Step 8: Create RLS policies
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

-- Step 9: Verify table creation
SELECT 
    'SUCCESS: facebook_data_edit_requests table is ready!' as status,
    COUNT(*) as total_columns
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'facebook_data_edit_requests';
