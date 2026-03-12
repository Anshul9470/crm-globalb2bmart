-- Run this SQL in your Supabase SQL Editor to add the approval system
-- This creates the approval_status enum and adds the necessary columns

-- Step 1: Create enum for approval status (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
        CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
    END IF;
END $$;

-- Step 2: Add approval_status column (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'approval_status'
    ) THEN
        ALTER TABLE public.companies 
        ADD COLUMN approval_status public.approval_status;
    END IF;
END $$;

-- Step 3: Add assigned_at column (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'assigned_at'
    ) THEN
        ALTER TABLE public.companies 
        ADD COLUMN assigned_at TIMESTAMPTZ;
    END IF;
END $$;

-- Step 4: Add deleted_at column (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE public.companies 
        ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Success message
SELECT 'Migration completed successfully! The approval_status, assigned_at, and deleted_at columns have been added.' AS message;

