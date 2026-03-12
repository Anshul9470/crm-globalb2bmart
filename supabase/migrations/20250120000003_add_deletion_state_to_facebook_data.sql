-- Add deletion_state field to facebook_data table for cascading deletion
-- Values: NULL (active), 'inactive' (in inactive section), 'team_lead_recycle' (in team lead recycle), 'admin_recycle' (in admin recycle)

-- Create enum for deletion state (if it doesn't exist - reuse from companies)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deletion_state') THEN
        CREATE TYPE public.deletion_state AS ENUM ('inactive', 'team_lead_recycle', 'admin_recycle');
    END IF;
END $$;

-- Add deletion_state column (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'facebook_data' 
        AND column_name = 'deletion_state'
    ) THEN
        ALTER TABLE public.facebook_data 
        ADD COLUMN deletion_state public.deletion_state;
    END IF;
END $$;

-- Add deleted_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'facebook_data' 
        AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE public.facebook_data 
        ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add deleted_by_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'facebook_data' 
        AND column_name = 'deleted_by_id'
    ) THEN
        ALTER TABLE public.facebook_data 
        ADD COLUMN deleted_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Success message
SELECT 'Migration completed successfully! The deletion_state, deleted_at, and deleted_by_id columns have been added to facebook_data table.' AS message;

