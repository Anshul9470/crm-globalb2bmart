-- ============================================================================
-- DUPLICATE VERIFICATION SCRIPT
-- Run this BEFORE and AFTER the migration to see the impact
-- Compatible with Supabase SQL Editor
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'DUPLICATE VERIFICATION REPORT';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 1: COUNT ALL RECORDS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'SECTION 1: TOTAL RECORD COUNTS';
  RAISE NOTICE '==============================================';
END $$;

SELECT 
  'Companies' as table_name,
  COUNT(*) as total_records
FROM public.companies
UNION ALL
SELECT 
  'Comments' as table_name,
  COUNT(*) as total_records
FROM public.comments
UNION ALL
SELECT 
  'Facebook Data Shares' as table_name,
  COUNT(*) as total_records
FROM public.facebook_data_shares
UNION ALL
SELECT 
  'Facebook Data Comments' as table_name,
  COUNT(*) as total_records
FROM public.facebook_data_comments
UNION ALL
SELECT 
  'Team Members' as table_name,
  COUNT(*) as total_records
FROM public.team_members
UNION ALL
SELECT 
  'User Roles' as table_name,
  COUNT(*) as total_records
FROM public.user_roles;

-- ============================================================================
-- SECTION 2: FIND DUPLICATE COMPANIES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'SECTION 2: DUPLICATE COMPANIES';
  RAISE NOTICE '==============================================';
END $$;

WITH duplicate_companies AS (
  SELECT 
    LOWER(TRIM(company_name)) as normalized_name,
    LOWER(TRIM(phone)) as normalized_phone,
    COUNT(*) as duplicate_count,
    STRING_AGG(company_name, ', ') as actual_names,
    STRING_AGG(id::text, ', ') as ids
  FROM public.companies
  GROUP BY LOWER(TRIM(company_name)), LOWER(TRIM(phone))
  HAVING COUNT(*) > 1
)
SELECT 
  normalized_name,
  normalized_phone,
  duplicate_count,
  actual_names,
  ids
FROM duplicate_companies
ORDER BY duplicate_count DESC;

SELECT 
  'Total Duplicate Company Sets: ' || COUNT(*) as summary
FROM (
  SELECT 
    LOWER(TRIM(company_name)),
    LOWER(TRIM(phone))
  FROM public.companies
  GROUP BY LOWER(TRIM(company_name)), LOWER(TRIM(phone))
  HAVING COUNT(*) > 1
) sub;

SELECT 
  'Total Duplicate Company Records to Remove: ' || 
  (SUM(cnt) - COUNT(*)) as summary
FROM (
  SELECT COUNT(*) as cnt
  FROM public.companies
  GROUP BY LOWER(TRIM(company_name)), LOWER(TRIM(phone))
  HAVING COUNT(*) > 1
) sub;

-- ============================================================================
-- SECTION 3: FIND DUPLICATE COMMENTS ON COMPANIES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'SECTION 3: DUPLICATE COMPANY COMMENTS';
  RAISE NOTICE '==============================================';
END $$;

WITH duplicate_comments AS (
  SELECT 
    company_id,
    user_id,
    category,
    LOWER(TRIM(comment_text)) as normalized_text,
    COUNT(*) as duplicate_count
  FROM public.comments
  GROUP BY company_id, user_id, category, LOWER(TRIM(comment_text))
  HAVING COUNT(*) > 1
)
SELECT 
  duplicate_count,
  COUNT(*) as number_of_duplicate_sets
FROM duplicate_comments
GROUP BY duplicate_count
ORDER BY duplicate_count DESC;

SELECT 
  'Total Duplicate Comment Records to Remove: ' || 
  COALESCE((SUM(cnt) - COUNT(*)), 0) as summary
FROM (
  SELECT COUNT(*) as cnt
  FROM public.comments
  GROUP BY company_id, user_id, category, LOWER(TRIM(comment_text))
  HAVING COUNT(*) > 1
) sub;

-- ============================================================================
-- SECTION 4: FIND DUPLICATE FACEBOOK DATA SHARES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'SECTION 4: DUPLICATE FACEBOOK DATA SHARES';
  RAISE NOTICE '==============================================';
END $$;

WITH duplicate_shares AS (
  SELECT 
    facebook_data_id,
    employee_id,
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ') as ids
  FROM public.facebook_data_shares
  GROUP BY facebook_data_id, employee_id
  HAVING COUNT(*) > 1
)
SELECT 
  facebook_data_id,
  employee_id,
  duplicate_count,
  ids
FROM duplicate_shares
ORDER BY duplicate_count DESC;

SELECT 
  'Total Duplicate Share Records to Remove: ' || 
  COALESCE((SUM(cnt) - COUNT(*)), 0) as summary
FROM (
  SELECT COUNT(*) as cnt
  FROM public.facebook_data_shares
  GROUP BY facebook_data_id, employee_id
  HAVING COUNT(*) > 1
) sub;

-- ============================================================================
-- SECTION 5: FIND DUPLICATE FACEBOOK DATA COMMENTS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'SECTION 5: DUPLICATE FACEBOOK DATA COMMENTS';
  RAISE NOTICE '==============================================';
END $$;

WITH duplicate_fb_comments AS (
  SELECT 
    facebook_data_id,
    user_id,
    category,
    LOWER(TRIM(comment_text)) as normalized_text,
    COUNT(*) as duplicate_count
  FROM public.facebook_data_comments
  GROUP BY facebook_data_id, user_id, category, LOWER(TRIM(comment_text))
  HAVING COUNT(*) > 1
)
SELECT 
  duplicate_count,
  COUNT(*) as number_of_duplicate_sets
FROM duplicate_fb_comments
GROUP BY duplicate_count
ORDER BY duplicate_count DESC;

SELECT 
  'Total Duplicate FB Comment Records to Remove: ' || 
  COALESCE((SUM(cnt) - COUNT(*)), 0) as summary
FROM (
  SELECT COUNT(*) as cnt
  FROM public.facebook_data_comments
  GROUP BY facebook_data_id, user_id, category, LOWER(TRIM(comment_text))
  HAVING COUNT(*) > 1
) sub;

-- ============================================================================
-- SECTION 6: FIND DUPLICATE TEAM MEMBERS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'SECTION 6: DUPLICATE TEAM MEMBERS';
  RAISE NOTICE '==============================================';
END $$;

WITH duplicate_team_members AS (
  SELECT 
    team_id,
    employee_id,
    COUNT(*) as duplicate_count
  FROM public.team_members
  GROUP BY team_id, employee_id
  HAVING COUNT(*) > 1
)
SELECT 
  team_id,
  employee_id,
  duplicate_count
FROM duplicate_team_members
ORDER BY duplicate_count DESC;

SELECT 
  'Total Duplicate Team Member Records to Remove: ' || 
  COALESCE((SUM(cnt) - COUNT(*)), 0) as summary
FROM (
  SELECT COUNT(*) as cnt
  FROM public.team_members
  GROUP BY team_id, employee_id
  HAVING COUNT(*) > 1
) sub;

-- ============================================================================
-- SECTION 7: FIND DUPLICATE USER ROLES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'SECTION 7: DUPLICATE USER ROLES';
  RAISE NOTICE '==============================================';
END $$;

WITH duplicate_roles AS (
  SELECT 
    user_id,
    role,
    COUNT(*) as duplicate_count
  FROM public.user_roles
  GROUP BY user_id, role
  HAVING COUNT(*) > 1
)
SELECT 
  user_id,
  role,
  duplicate_count
FROM duplicate_roles
ORDER BY duplicate_count DESC;

SELECT 
  'Total Duplicate User Role Records to Remove: ' || 
  COALESCE((SUM(cnt) - COUNT(*)), 0) as summary
FROM (
  SELECT COUNT(*) as cnt
  FROM public.user_roles
  GROUP BY user_id, role
  HAVING COUNT(*) > 1
) sub;

-- ============================================================================
-- SECTION 8: SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'SECTION 8: OVERALL SUMMARY';
  RAISE NOTICE '==============================================';
END $$;

WITH summary AS (
  SELECT 
    'Companies' as category,
    COALESCE((SUM(cnt) - COUNT(*)), 0) as duplicates_to_remove
  FROM (
    SELECT COUNT(*) as cnt
    FROM public.companies
    GROUP BY LOWER(TRIM(company_name)), LOWER(TRIM(phone))
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT 
    'Company Comments' as category,
    COALESCE((SUM(cnt) - COUNT(*)), 0) as duplicates_to_remove
  FROM (
    SELECT COUNT(*) as cnt
    FROM public.comments
    GROUP BY company_id, user_id, category, LOWER(TRIM(comment_text))
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT 
    'Facebook Data Shares' as category,
    COALESCE((SUM(cnt) - COUNT(*)), 0) as duplicates_to_remove
  FROM (
    SELECT COUNT(*) as cnt
    FROM public.facebook_data_shares
    GROUP BY facebook_data_id, employee_id
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT 
    'Facebook Data Comments' as category,
    COALESCE((SUM(cnt) - COUNT(*)), 0) as duplicates_to_remove
  FROM (
    SELECT COUNT(*) as cnt
    FROM public.facebook_data_comments
    GROUP BY facebook_data_id, user_id, category, LOWER(TRIM(comment_text))
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT 
    'Team Members' as category,
    COALESCE((SUM(cnt) - COUNT(*)), 0) as duplicates_to_remove
  FROM (
    SELECT COUNT(*) as cnt
    FROM public.team_members
    GROUP BY team_id, employee_id
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT 
    'User Roles' as category,
    COALESCE((SUM(cnt) - COUNT(*)), 0) as duplicates_to_remove
  FROM (
    SELECT COUNT(*) as cnt
    FROM public.user_roles
    GROUP BY user_id, role
    HAVING COUNT(*) > 1
  ) sub
)
SELECT 
  category,
  duplicates_to_remove
FROM summary
WHERE duplicates_to_remove > 0
ORDER BY duplicates_to_remove DESC;

SELECT 
  'TOTAL RECORDS TO BE REMOVED: ' || 
  COALESCE(SUM(duplicates_to_remove), 0) as total_summary
FROM (
  SELECT 
    COALESCE((SUM(cnt) - COUNT(*)), 0) as duplicates_to_remove
  FROM (
    SELECT COUNT(*) as cnt FROM public.companies
    GROUP BY LOWER(TRIM(company_name)), LOWER(TRIM(phone))
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT COALESCE((SUM(cnt) - COUNT(*)), 0)
  FROM (
    SELECT COUNT(*) as cnt FROM public.comments
    GROUP BY company_id, user_id, category, LOWER(TRIM(comment_text))
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT COALESCE((SUM(cnt) - COUNT(*)), 0)
  FROM (
    SELECT COUNT(*) as cnt FROM public.facebook_data_shares
    GROUP BY facebook_data_id, employee_id
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT COALESCE((SUM(cnt) - COUNT(*)), 0)
  FROM (
    SELECT COUNT(*) as cnt FROM public.facebook_data_comments
    GROUP BY facebook_data_id, user_id, category, LOWER(TRIM(comment_text))
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT COALESCE((SUM(cnt) - COUNT(*)), 0)
  FROM (
    SELECT COUNT(*) as cnt FROM public.team_members
    GROUP BY team_id, employee_id
    HAVING COUNT(*) > 1
  ) sub
  
  UNION ALL
  
  SELECT COALESCE((SUM(cnt) - COUNT(*)), 0)
  FROM (
    SELECT COUNT(*) as cnt FROM public.user_roles
    GROUP BY user_id, role
    HAVING COUNT(*) > 1
  ) sub
) all_duplicates;

DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'VERIFICATION COMPLETE';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
END $$;

