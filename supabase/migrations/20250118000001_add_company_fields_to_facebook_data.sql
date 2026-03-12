-- Add company-related fields to facebook_data table for employee submissions
-- These fields will be used when employees submit their Facebook data after approval

-- Add company_name column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'facebook_data' 
    AND column_name = 'company_name'
  ) THEN
    ALTER TABLE public.facebook_data ADD COLUMN company_name TEXT;
  END IF;
END $$;

-- Add owner_name column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'facebook_data' 
    AND column_name = 'owner_name'
  ) THEN
    ALTER TABLE public.facebook_data ADD COLUMN owner_name TEXT;
  END IF;
END $$;

-- Add products column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'facebook_data' 
    AND column_name = 'products'
  ) THEN
    ALTER TABLE public.facebook_data ADD COLUMN products TEXT;
  END IF;
END $$;

-- Add services column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'facebook_data' 
    AND column_name = 'services'
  ) THEN
    ALTER TABLE public.facebook_data ADD COLUMN services TEXT;
  END IF;
END $$;

