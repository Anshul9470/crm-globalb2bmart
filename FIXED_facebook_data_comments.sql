-- FIXED: Create facebook_data_comments table
-- This version handles the case where facebook_data table might not have a primary key
-- Copy and paste this ENTIRE script into Supabase SQL Editor and run it

-- 1. Drop table if exists (to start fresh)
DROP TABLE IF EXISTS public.facebook_data_comments CASCADE;

-- 2. Ensure facebook_data table has a primary key on id column
DO $$
BEGIN
  -- Check if facebook_data table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'facebook_data'
  ) THEN
    -- Check if primary key exists, if not, add it
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public' 
      AND table_name = 'facebook_data'
      AND constraint_type = 'PRIMARY KEY'
    ) THEN
      -- Add primary key constraint if id column exists
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'facebook_data'
        AND column_name = 'id'
      ) THEN
        -- Try to add primary key (this might fail if there are duplicates or nulls)
        BEGIN
          ALTER TABLE public.facebook_data ADD CONSTRAINT facebook_data_pkey PRIMARY KEY (id);
        EXCEPTION
          WHEN others THEN
            RAISE NOTICE 'Could not add primary key to facebook_data: %', SQLERRM;
        END;
      END IF;
    END IF;
  END IF;
END $$;

-- 3. Create the facebook_data_comments table
CREATE TABLE public.facebook_data_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  comment_text TEXT NOT NULL,
  category public.comment_category NOT NULL,
  comment_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add foreign key constraint to facebook_data (only if primary key exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'facebook_data'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'facebook_data'
    AND constraint_type = 'PRIMARY KEY'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND constraint_name = 'fk_facebook_data_comments_facebook_data'
  ) THEN
    ALTER TABLE public.facebook_data_comments
    ADD CONSTRAINT fk_facebook_data_comments_facebook_data 
      FOREIGN KEY (facebook_data_id) 
      REFERENCES public.facebook_data(id) 
      ON DELETE CASCADE;
  ELSE
    RAISE NOTICE 'Skipping foreign key constraint - facebook_data table may not have a primary key';
  END IF;
END $$;

-- 5. Enable RLS
ALTER TABLE public.facebook_data_comments ENABLE ROW LEVEL SECURITY;

-- 6. Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view facebook data comments" ON public.facebook_data_comments;
DROP POLICY IF EXISTS "Users can insert facebook data comments" ON public.facebook_data_comments;
DROP POLICY IF EXISTS "Users can delete their own facebook data comments" ON public.facebook_data_comments;

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_facebook_data_comments_facebook_data_id ON public.facebook_data_comments(facebook_data_id);
CREATE INDEX IF NOT EXISTS idx_facebook_data_comments_user_id ON public.facebook_data_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_data_comments_created_at ON public.facebook_data_comments(created_at DESC);

-- 8. Create RLS Policies

-- Users can view comments for Facebook data they have access to
CREATE POLICY "Users can view facebook data comments"
  ON public.facebook_data_comments FOR SELECT
  TO authenticated
  USING (
    -- Admins can see all comments
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR
    -- Employees can see comments on Facebook data shared with them
    (
      EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'facebook_data_shares'
      ) AND
      EXISTS (
        SELECT 1 FROM public.facebook_data_shares
        WHERE facebook_data_shares.facebook_data_id = facebook_data_comments.facebook_data_id
        AND facebook_data_shares.employee_id = auth.uid()
      )
    )
  );

-- Authenticated users can insert comments for Facebook data they have access to
CREATE POLICY "Users can insert facebook data comments"
  ON public.facebook_data_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    (
      -- Admins can comment on any Facebook data
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      ) OR
      -- Employees can comment on Facebook data shared with them
      (
        EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'facebook_data_shares'
        ) AND
        EXISTS (
          SELECT 1 FROM public.facebook_data_shares
          WHERE facebook_data_shares.facebook_data_id = facebook_data_comments.facebook_data_id
          AND facebook_data_shares.employee_id = auth.uid()
        )
      )
    )
  );

-- Users can delete their own comments
CREATE POLICY "Users can delete their own facebook data comments"
  ON public.facebook_data_comments FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 9. Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- Success message
SELECT '✅ facebook_data_comments table created successfully!' as result;

