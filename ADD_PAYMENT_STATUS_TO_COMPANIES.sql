-- Add payment status field to companies table for Paid Client Pool
-- Run this in Supabase SQL Editor

-- Add is_paid column (boolean) if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'is_paid'
    ) THEN
        ALTER TABLE public.companies 
        ADD COLUMN is_paid BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Add payment_date column (timestamptz) if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'payment_date'
    ) THEN
        ALTER TABLE public.companies 
        ADD COLUMN payment_date TIMESTAMPTZ;
    END IF;
END $$;

-- Add payment_amount column (numeric) if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'payment_amount'
    ) THEN
        ALTER TABLE public.companies 
        ADD COLUMN payment_amount NUMERIC(10, 2);
    END IF;
END $$;

-- Create index on is_paid for faster queries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'companies' 
        AND indexname = 'idx_companies_is_paid'
    ) THEN
        CREATE INDEX idx_companies_is_paid ON public.companies(is_paid);
    END IF;
END $$;

-- Success message
SELECT 'Migration completed successfully! The is_paid, payment_date, and payment_amount columns have been added to companies table.' AS message;

