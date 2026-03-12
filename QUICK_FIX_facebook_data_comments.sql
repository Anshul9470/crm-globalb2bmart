-- QUICK FIX: Create facebook_data_comments table
-- Copy and paste this ENTIRE script into Supabase SQL Editor and run it

-- 1. Drop table if exists (to start fresh)
DROP TABLE IF EXISTS public.facebook_data_comments CASCADE;

-- 2. Create the table
CREATE TABLE public.facebook_data_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  comment_text TEXT NOT NULL,
  category public.comment_category NOT NULL,
  comment_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add foreign key constraint to facebook_data if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'facebook_data'
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
  END IF;
END $$;

-- 4. Enable RLS
ALTER TABLE public.facebook_data_comments ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view facebook data comments" ON public.facebook_data_comments;
DROP POLICY IF EXISTS "Users can insert facebook data comments" ON public.facebook_data_comments;
DROP POLICY IF EXISTS "Users can delete their own facebook data comments" ON public.facebook_data_comments;

-- 6. Create indexes
CREATE INDEX idx_facebook_data_comments_facebook_data_id ON public.facebook_data_comments(facebook_data_id);
CREATE INDEX idx_facebook_data_comments_user_id ON public.facebook_data_comments(user_id);
CREATE INDEX idx_facebook_data_comments_created_at ON public.facebook_data_comments(created_at DESC);

-- 7. Create RLS Policies

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
    EXISTS (
      SELECT 1 FROM public.facebook_data_shares
      WHERE facebook_data_shares.facebook_data_id = facebook_data_comments.facebook_data_id
      AND facebook_data_shares.employee_id = auth.uid()
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
      EXISTS (
        SELECT 1 FROM public.facebook_data_shares
        WHERE facebook_data_shares.facebook_data_id = facebook_data_comments.facebook_data_id
        AND facebook_data_shares.employee_id = auth.uid()
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

-- 8. Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- Success message
SELECT '✅ facebook_data_comments table created successfully!' as result;

