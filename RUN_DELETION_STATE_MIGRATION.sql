-- Run this SQL in your Supabase SQL Editor to add the cascading deletion system
-- This creates the deletion_state enum and adds the necessary columns

-- Step 1: Create enum for deletion state (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deletion_state') THEN
        CREATE TYPE public.deletion_state AS ENUM ('inactive', 'team_lead_recycle', 'admin_recycle');
    END IF;
END $$;

-- Step 2: Add deletion_state column (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'deletion_state'
    ) THEN
        ALTER TABLE public.companies 
        ADD COLUMN deletion_state public.deletion_state;
    END IF;
END $$;

-- Step 3: Add deleted_by_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'deleted_by_id'
    ) THEN
        ALTER TABLE public.companies 
        ADD COLUMN deleted_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Success message
SELECT 'Migration completed successfully! The deletion_state and deleted_by_id columns have been added.' AS message;

