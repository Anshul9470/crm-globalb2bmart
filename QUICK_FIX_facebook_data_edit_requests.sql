-- QUICK FIX: Create facebook_data_edit_requests table
-- Copy and paste this ENTIRE script into Supabase SQL Editor and run it

-- Create function (if not exists)
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

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Employees can view their own edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Employees can create edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Admins can update edit requests" ON public.facebook_data_edit_requests;
DROP POLICY IF EXISTS "Admins can delete edit requests" ON public.facebook_data_edit_requests;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_requested_by ON public.facebook_data_edit_requests(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_facebook_data_id ON public.facebook_data_edit_requests(facebook_data_id);
CREATE INDEX IF NOT EXISTS idx_facebook_data_edit_requests_status ON public.facebook_data_edit_requests(status);

-- Create trigger
DROP TRIGGER IF EXISTS update_facebook_data_edit_requests_updated_at ON public.facebook_data_edit_requests;
CREATE TRIGGER update_facebook_data_edit_requests_updated_at
  BEFORE UPDATE ON public.facebook_data_edit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
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

