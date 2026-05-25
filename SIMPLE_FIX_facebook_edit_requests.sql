-- SIMPLE FIX - Run this entire script in one go
-- This creates the table and all necessary components

-- 1. Create function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop table if exists (to start fresh)
DROP TABLE IF EXISTS public.facebook_data_edit_requests CASCADE;

-- 3. Create table
CREATE TABLE public.facebook_data_edit_requests (
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

-- 4. Enable RLS
ALTER TABLE public.facebook_data_edit_requests ENABLE ROW LEVEL SECURITY;

-- 5. Create indexes
CREATE INDEX idx_facebook_data_edit_requests_requested_by ON public.facebook_data_edit_requests(requested_by_id);
CREATE INDEX idx_facebook_data_edit_requests_facebook_data_id ON public.facebook_data_edit_requests(facebook_data_id);
CREATE INDEX idx_facebook_data_edit_requests_status ON public.facebook_data_edit_requests(status);

-- 6. Create trigger
CREATE TRIGGER update_facebook_data_edit_requests_updated_at
  BEFORE UPDATE ON public.facebook_data_edit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Create RLS Policies
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

-- 8. Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- Success message
SELECT '✅ facebook_data_edit_requests table created successfully!' as result;

