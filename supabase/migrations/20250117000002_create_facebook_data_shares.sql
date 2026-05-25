-- Create facebook_data_shares table to track which Facebook data is shared with which employees
CREATE TABLE IF NOT EXISTS public.facebook_data_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  shared_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.data_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(facebook_data_id, employee_id)
);

ALTER TABLE public.facebook_data_shares ENABLE ROW LEVEL SECURITY;

-- Create indexes for better query performance
CREATE INDEX idx_facebook_data_shares_employee_id ON public.facebook_data_shares(employee_id);
CREATE INDEX idx_facebook_data_shares_facebook_data_id ON public.facebook_data_shares(facebook_data_id);
CREATE INDEX idx_facebook_data_shares_request_id ON public.facebook_data_shares(request_id);

-- RLS Policies for facebook_data_shares

-- Employees can view their own shared data
CREATE POLICY "Employees can view their own shared facebook data"
  ON public.facebook_data_shares FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can share Facebook data
CREATE POLICY "Admins can share facebook data"
  ON public.facebook_data_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) AND
    shared_by_id = auth.uid()
  );

-- Only admins can delete shares
CREATE POLICY "Admins can delete facebook data shares"
  ON public.facebook_data_shares FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

