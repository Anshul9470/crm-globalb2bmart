-- Create login_approvals table to track user login approval status
CREATE TABLE IF NOT EXISTS public.login_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  UNIQUE(user_id)
);

ALTER TABLE public.login_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for login_approvals
CREATE POLICY "Admins can view all login approvals"
  ON public.login_approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Users can view their own approval status"
  ON public.login_approvals FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anyone can insert login approval requests"
  ON public.login_approvals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow service role to insert (for edge functions)
CREATE POLICY "Service role can insert login approval requests"
  ON public.login_approvals FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Only admins can update login approvals"
  ON public.login_approvals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Create index for faster lookups
CREATE INDEX idx_login_approvals_user_id ON public.login_approvals(user_id);
CREATE INDEX idx_login_approvals_status ON public.login_approvals(status);
