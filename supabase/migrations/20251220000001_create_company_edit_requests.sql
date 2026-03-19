-- Create company_edit_requests table to track edit requests from employees
CREATE TABLE IF NOT EXISTS public.company_edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  requested_by_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  request_message TEXT,
  company_name TEXT,
  owner_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  products_services TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_edit_requests ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_company_edit_requests_requested_by ON public.company_edit_requests(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_company_edit_requests_company_id ON public.company_edit_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_company_edit_requests_status ON public.company_edit_requests(status);

-- Create trigger for updated_at
DO $$ BEGIN
  CREATE TRIGGER update_company_edit_requests_updated_at
    BEFORE UPDATE ON public.company_edit_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies

-- Employees can view their own company edit requests
DO $$ BEGIN
  CREATE POLICY "Employees can view their own company edit requests"
    ON public.company_edit_requests FOR SELECT
    TO authenticated
    USING (
      requested_by_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Employees can create company edit requests
DO $$ BEGIN
  CREATE POLICY "Employees can create company edit requests"
    ON public.company_edit_requests FOR INSERT
    TO authenticated
    WITH CHECK (requested_by_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Only admins can update company edit requests (approve/reject)
DO $$ BEGIN
  CREATE POLICY "Admins can update company edit requests"
    ON public.company_edit_requests FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Only admins can delete company edit requests
DO $$ BEGIN
  CREATE POLICY "Admins can delete company edit requests"
    ON public.company_edit_requests FOR DELETE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
