-- Diagnostic SQL to check Facebook data sharing
-- Run this as ADMIN to verify shares are working

-- 1. Check if shares exist
SELECT 
    fds.id as share_id,
    fds.employee_id,
    fds.facebook_data_id,
    fds.shared_by_id,
    fds.created_at as shared_at,
    p_employee.display_name as employee_name,
    p_employee.email as employee_email,
    p_admin.display_name as shared_by_name,
    fd.name as facebook_data_name,
    fd.email as facebook_data_email
FROM public.facebook_data_shares fds
LEFT JOIN public.profiles p_employee ON fds.employee_id = p_employee.id
LEFT JOIN public.profiles p_admin ON fds.shared_by_id = p_admin.id
LEFT JOIN public.facebook_data fd ON fds.facebook_data_id = fd.id
ORDER BY fds.created_at DESC;

-- 2. Count shares per employee
SELECT 
    p.display_name as employee_name,
    p.email as employee_email,
    COUNT(fds.id) as shared_count
FROM public.profiles p
LEFT JOIN public.facebook_data_shares fds ON p.id = fds.employee_id
GROUP BY p.id, p.display_name, p.email
HAVING COUNT(fds.id) > 0
ORDER BY shared_count DESC;

-- 3. Check RLS policies on facebook_data_shares
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'facebook_data_shares'
ORDER BY policyname;

-- 4. Check RLS policies on facebook_data
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'facebook_data'
ORDER BY policyname;

-- 5. Test query (simulating employee view)
-- Replace 'EMPLOYEE_USER_ID_HERE' with actual employee UUID
-- SELECT 
--     fd.*
-- FROM public.facebook_data_shares fds
-- JOIN public.facebook_data fd ON fds.facebook_data_id = fd.id
-- WHERE fds.employee_id = 'EMPLOYEE_USER_ID_HERE';

