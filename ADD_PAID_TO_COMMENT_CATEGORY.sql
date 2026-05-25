-- Add 'paid' to comment_category enum for Paid Client Pool feature
-- Run this in Supabase SQL Editor
-- This allows employees to mark companies as paid via comments

-- Check if 'paid' value already exists in the enum
DO $$ 
BEGIN
    -- Add 'paid' to the enum if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'paid' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'comment_category')
    ) THEN
        ALTER TYPE public.comment_category ADD VALUE 'paid';
    END IF;
END $$;

-- Success message
SELECT 'Migration completed successfully! The "paid" value has been added to comment_category enum.' AS message;

