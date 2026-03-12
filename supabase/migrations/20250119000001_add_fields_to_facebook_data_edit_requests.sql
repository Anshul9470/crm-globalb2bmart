-- Add fields to store employee-submitted data in edit requests
ALTER TABLE public.facebook_data_edit_requests
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS owner_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS products TEXT,
ADD COLUMN IF NOT EXISTS services TEXT;

