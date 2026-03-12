-- Add approval_status field to companies table
-- Values: 'pending' (waiting for admin approval), 'approved' (approved by admin), 'rejected' (rejected by admin)
-- NULL means it was created by admin directly (no approval needed)

-- Create enum for approval status (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
        CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
    END IF;
END $$;

-- Add approval_status column (if it doesn't exist)
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

-- Add assigned_at column if it doesn't exist
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

-- Add deleted_at column if it doesn't exist (for soft deletes)
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

-- Set default approval_status to NULL for existing companies (admin-created)
-- New companies created by employees will have 'pending' status

