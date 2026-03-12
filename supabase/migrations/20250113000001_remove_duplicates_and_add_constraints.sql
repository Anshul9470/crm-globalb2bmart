-- ============================================================================
-- MIGRATION: Remove Duplicates and Add Unique Constraints
-- Purpose: Clean up duplicate data and prevent future duplicates
-- Date: 2025-01-13
-- ============================================================================

-- ============================================================================
-- PART 1: REMOVE DUPLICATE COMPANIES
-- ============================================================================

-- Step 1: Find and keep only the oldest company record for each duplicate set
-- Based on company_name + phone combination (case-insensitive)
WITH duplicate_companies AS (
  SELECT 
    id,
    company_name,
    phone,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(company_name)), LOWER(TRIM(phone))
      ORDER BY created_at ASC, id ASC
    ) as rn
  FROM public.companies
)
DELETE FROM public.companies
WHERE id IN (
  SELECT id FROM duplicate_companies WHERE rn > 1
);

-- Step 2: Add unique constraint to prevent future duplicates in companies
-- Create a unique index on lowercase company_name and phone
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_unique_name_phone 
  ON public.companies (LOWER(TRIM(company_name)), LOWER(TRIM(phone)));

-- ============================================================================
-- PART 2: REMOVE DUPLICATE COMMENTS ON COMPANIES
-- ============================================================================

-- Remove duplicate comments (same company, user, category, and text)
WITH duplicate_comments AS (
  SELECT 
    id,
    company_id,
    user_id,
    category,
    comment_text,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, user_id, category, LOWER(TRIM(comment_text))
      ORDER BY created_at DESC, id DESC
    ) as rn
  FROM public.comments
)
DELETE FROM public.comments
WHERE id IN (
  SELECT id FROM duplicate_comments WHERE rn > 1
);

-- ============================================================================
-- PART 3: REMOVE DUPLICATE FACEBOOK DATA SHARES
-- ============================================================================

-- Remove duplicate facebook_data_shares (already has UNIQUE constraint, but clean existing)
WITH duplicate_fb_shares AS (
  SELECT 
    id,
    facebook_data_id,
    employee_id,
    ROW_NUMBER() OVER (
      PARTITION BY facebook_data_id, employee_id
      ORDER BY created_at ASC, id ASC
    ) as rn
  FROM public.facebook_data_shares
)
DELETE FROM public.facebook_data_shares
WHERE id IN (
  SELECT id FROM duplicate_fb_shares WHERE rn > 1
);

-- ============================================================================
-- PART 4: REMOVE DUPLICATE FACEBOOK DATA COMMENTS
-- ============================================================================

-- Remove duplicate facebook_data_comments (same data, user, category, and text)
WITH duplicate_fb_comments AS (
  SELECT 
    id,
    facebook_data_id,
    user_id,
    category,
    comment_text,
    ROW_NUMBER() OVER (
      PARTITION BY facebook_data_id, user_id, category, LOWER(TRIM(comment_text))
      ORDER BY created_at DESC, id DESC
    ) as rn
  FROM public.facebook_data_comments
)
DELETE FROM public.facebook_data_comments
WHERE id IN (
  SELECT id FROM duplicate_fb_comments WHERE rn > 1
);

-- ============================================================================
-- PART 5: REMOVE DUPLICATE TEAM MEMBERS
-- ============================================================================

-- Remove duplicate team_members (already has UNIQUE constraint, but clean existing)
WITH duplicate_team_members AS (
  SELECT 
    id,
    team_id,
    employee_id,
    ROW_NUMBER() OVER (
      PARTITION BY team_id, employee_id
      ORDER BY added_at ASC, id ASC
    ) as rn
  FROM public.team_members
)
DELETE FROM public.team_members
WHERE id IN (
  SELECT id FROM duplicate_team_members WHERE rn > 1
);

-- ============================================================================
-- PART 6: REMOVE DUPLICATE USER ROLES
-- ============================================================================

-- Remove duplicate user_roles (already has UNIQUE constraint, but clean existing)
WITH duplicate_roles AS (
  SELECT 
    id,
    user_id,
    role,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, role
      ORDER BY created_at ASC, id ASC
    ) as rn
  FROM public.user_roles
)
DELETE FROM public.user_roles
WHERE id IN (
  SELECT id FROM duplicate_roles WHERE rn > 1
);

-- ============================================================================
-- PART 7: ADD ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================================================

-- Add index for company email lookups
CREATE INDEX IF NOT EXISTS idx_companies_email ON public.companies (LOWER(email));

-- Add composite index for assigned companies
CREATE INDEX IF NOT EXISTS idx_companies_assigned_to_created 
  ON public.companies (assigned_to_id, created_at DESC);

-- Add index for comment lookups by category
CREATE INDEX IF NOT EXISTS idx_comments_category ON public.comments (category);

-- Add composite index for company comments
CREATE INDEX IF NOT EXISTS idx_comments_company_created 
  ON public.comments (company_id, created_at DESC);

-- Add index for facebook_data_comments by category
CREATE INDEX IF NOT EXISTS idx_facebook_data_comments_category 
  ON public.facebook_data_comments (category);

-- ============================================================================
-- PART 8: CREATE HELPFUL VIEWS FOR MONITORING DUPLICATES
-- ============================================================================

-- View to monitor potential duplicate companies in the future
CREATE OR REPLACE VIEW public.v_potential_duplicate_companies AS
SELECT 
  LOWER(TRIM(company_name)) as normalized_company_name,
  LOWER(TRIM(phone)) as normalized_phone,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY created_at) as company_ids,
  ARRAY_AGG(created_at ORDER BY created_at) as created_dates
FROM public.companies
GROUP BY LOWER(TRIM(company_name)), LOWER(TRIM(phone))
HAVING COUNT(*) > 1;

-- View to monitor potential duplicate facebook shares
CREATE OR REPLACE VIEW public.v_potential_duplicate_fb_shares AS
SELECT 
  facebook_data_id,
  employee_id,
  COUNT(*) as share_count,
  ARRAY_AGG(id ORDER BY created_at) as share_ids
FROM public.facebook_data_shares
GROUP BY facebook_data_id, employee_id
HAVING COUNT(*) > 1;

-- ============================================================================
-- PART 9: CREATE FUNCTIONS TO PREVENT DUPLICATES AT APPLICATION LEVEL
-- ============================================================================

-- Function to check if company already exists before insert
CREATE OR REPLACE FUNCTION public.check_company_duplicate()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.companies
    WHERE id != NEW.id
    AND LOWER(TRIM(company_name)) = LOWER(TRIM(NEW.company_name))
    AND LOWER(TRIM(phone)) = LOWER(TRIM(NEW.phone))
  ) THEN
    RAISE EXCEPTION 'Company with this name and phone already exists';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent duplicate companies
DROP TRIGGER IF EXISTS trigger_check_company_duplicate ON public.companies;
CREATE TRIGGER trigger_check_company_duplicate
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_company_duplicate();

-- ============================================================================
-- PART 10: GRANT PERMISSIONS FOR VIEWS
-- ============================================================================

-- Grant access to monitoring views
GRANT SELECT ON public.v_potential_duplicate_companies TO authenticated;
GRANT SELECT ON public.v_potential_duplicate_fb_shares TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Output summary
DO $$
DECLARE
  company_count INTEGER;
  fb_share_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO company_count FROM public.companies;
  SELECT COUNT(*) INTO fb_share_count FROM public.facebook_data_shares;
  
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Duplicate removal and constraint migration complete!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Current record counts:';
  RAISE NOTICE '  - Companies: %', company_count;
  RAISE NOTICE '  - Facebook Data Shares: %', fb_share_count;
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Use these views to monitor for future duplicates:';
  RAISE NOTICE '  - v_potential_duplicate_companies';
  RAISE NOTICE '  - v_potential_duplicate_fb_shares';
  RAISE NOTICE '==============================================';
END $$;

