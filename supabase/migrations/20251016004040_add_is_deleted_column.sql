-- Add is_deleted column to companies table
ALTER TABLE public.companies ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

-- Create index for faster queries on is_deleted column
CREATE INDEX idx_companies_is_deleted ON public.companies(is_deleted);