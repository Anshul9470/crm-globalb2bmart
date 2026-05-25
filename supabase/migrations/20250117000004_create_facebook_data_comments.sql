-- Create facebook_data_comments table to allow commenting on Facebook data entries
CREATE TABLE IF NOT EXISTS public.facebook_data_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  comment_text TEXT NOT NULL,
  category public.comment_category NOT NULL,
  comment_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint if facebook_data table exists and has id column as primary key
-- This is done separately to avoid errors if the table structure isn't ready
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
  ) THEN
    -- Only add foreign key if it doesn't exist
    IF NOT EXISTS (
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
  END IF;
END $$;

ALTER TABLE public.facebook_data_comments ENABLE ROW LEVEL SECURITY;

-- Create indexes for better query performance
CREATE INDEX idx_facebook_data_comments_facebook_data_id ON public.facebook_data_comments(facebook_data_id);
CREATE INDEX idx_facebook_data_comments_user_id ON public.facebook_data_comments(user_id);
CREATE INDEX idx_facebook_data_comments_created_at ON public.facebook_data_comments(created_at DESC);

-- RLS Policies for facebook_data_comments

-- Users can view comments for Facebook data they have access to
-- (either shared with them or they're admin)
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

