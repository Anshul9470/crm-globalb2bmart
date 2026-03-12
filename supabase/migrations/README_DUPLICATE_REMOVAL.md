# Database Duplicate Removal and Prevention Guide

## Overview
This migration removes existing duplicate data from your Supabase database and implements constraints to prevent future duplicates.

## What This Migration Does

### 1. **Removes Duplicate Companies** 🏢
- Identifies companies with the same name and phone number
- Keeps the oldest record and removes duplicates
- Adds a unique constraint to prevent future duplicates
- Case-insensitive matching (e.g., "ABC Ltd" = "abc ltd")

### 2. **Removes Duplicate Comments** 💬
- Removes duplicate comments on companies
- Removes duplicate comments on Facebook data
- Based on: user, company/facebook_data, category, and comment text

### 3. **Removes Duplicate Shares** 🔗
- Cleans up duplicate Facebook data shares
- Ensures each employee has only one share record per Facebook data item

### 4. **Removes Duplicate Team Members** 👥
- Ensures employees are not added to the same team multiple times

### 5. **Removes Duplicate User Roles** 🔐
- Ensures each user has only one of each role type

### 6. **Adds Performance Indexes** ⚡
- Improves query performance for common operations
- Optimizes lookups by email, phone, category, etc.

### 7. **Creates Monitoring Views** 📊
- `v_potential_duplicate_companies` - View to check for duplicate companies
- `v_potential_duplicate_fb_shares` - View to check for duplicate shares

### 8. **Adds Prevention Triggers** 🛡️
- Automatically prevents duplicate companies from being inserted
- Shows helpful error message when duplicate is attempted

---

## How to Apply This Migration

### Option 1: Using Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed):
```bash
npm install -g supabase
```

2. **Link your project**:
```bash
supabase link --project-ref your-project-ref
```

3. **Apply the migration**:
```bash
supabase db push
```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `20250113000001_remove_duplicates_and_add_constraints.sql`
4. Paste into the SQL Editor
5. Click **Run** to execute

### Option 3: Using Migration Command

```bash
supabase migration up
```

---

## Before Running the Migration

### ⚠️ IMPORTANT: Create a Backup

**Create a database backup before running this migration:**

1. Go to Supabase Dashboard → Settings → Database
2. Click "Create Backup"
3. Wait for backup to complete

### Check for Duplicates

Run these queries to see how many duplicates exist:

```sql
-- Check duplicate companies
SELECT 
  LOWER(TRIM(company_name)) as company, 
  LOWER(TRIM(phone)) as phone,
  COUNT(*) as count
FROM public.companies
GROUP BY LOWER(TRIM(company_name)), LOWER(TRIM(phone))
HAVING COUNT(*) > 1;

-- Check duplicate facebook shares
SELECT 
  facebook_data_id,
  employee_id,
  COUNT(*) as count
FROM public.facebook_data_shares
GROUP BY facebook_data_id, employee_id
HAVING COUNT(*) > 1;
```

---

## After Running the Migration

### Verify the Migration

1. **Check the monitoring views**:
```sql
-- Should return 0 rows if successful
SELECT * FROM public.v_potential_duplicate_companies;
SELECT * FROM public.v_potential_duplicate_fb_shares;
```

2. **Check record counts**:
```sql
SELECT 
  'companies' as table_name, 
  COUNT(*) as count 
FROM public.companies
UNION ALL
SELECT 
  'facebook_data_shares', 
  COUNT(*) 
FROM public.facebook_data_shares
UNION ALL
SELECT 
  'comments', 
  COUNT(*) 
FROM public.comments;
```

### Test Duplicate Prevention

Try to insert a duplicate company (should fail):

```sql
-- This should raise an error
INSERT INTO public.companies (
  company_name, 
  owner_name, 
  phone, 
  created_by_id
) 
SELECT 
  company_name, 
  owner_name, 
  phone, 
  created_by_id
FROM public.companies 
LIMIT 1;
```

Expected error: `Company with this name and phone already exists`

---

## Application-Level Changes (Optional but Recommended)

### Update Your Application Code

Add duplicate checks before inserting companies:

```typescript
// Example in your company creation code
const checkDuplicateCompany = async (companyName: string, phone: string) => {
  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .ilike('company_name', companyName.trim())
    .ilike('phone', phone.trim())
    .maybeSingle();
  
  if (data) {
    throw new Error('Company with this name and phone already exists');
  }
};

// Use before creating a company
await checkDuplicateCompany(companyName, phone);
```

### Handle Errors Gracefully

```typescript
try {
  await supabase.from('companies').insert(companyData);
} catch (error) {
  if (error.message.includes('already exists')) {
    // Show user-friendly message
    toast.error('This company is already in the system');
  } else {
    // Handle other errors
    toast.error('Failed to create company');
  }
}
```

---

## Monitoring for Future Duplicates

### Set Up Periodic Checks

Run these queries weekly to monitor for any new duplicates:

```sql
-- Weekly duplicate check
SELECT 
  'Duplicate Companies' as check_type,
  COUNT(*) as count
FROM public.v_potential_duplicate_companies
UNION ALL
SELECT 
  'Duplicate FB Shares',
  COUNT(*)
FROM public.v_potential_duplicate_fb_shares;
```

### Create an Alert (Optional)

You can set up a scheduled function in Supabase to alert you:

```sql
-- Create a function to check for duplicates
CREATE OR REPLACE FUNCTION public.check_for_duplicates()
RETURNS TABLE(issue_type TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'Duplicate Companies'::TEXT,
    COUNT(*)
  FROM public.v_potential_duplicate_companies
  UNION ALL
  SELECT 
    'Duplicate FB Shares'::TEXT,
    COUNT(*)
  FROM public.v_potential_duplicate_fb_shares;
END;
$$ LANGUAGE plpgsql;
```

---

## Rollback Plan

If you need to rollback (not recommended, but here's how):

1. Restore from the backup you created
2. OR manually drop the constraints:

```sql
-- Remove unique index
DROP INDEX IF EXISTS public.idx_companies_unique_name_phone;

-- Remove trigger
DROP TRIGGER IF EXISTS trigger_check_company_duplicate ON public.companies;
DROP FUNCTION IF EXISTS public.check_company_duplicate();

-- Remove views
DROP VIEW IF EXISTS public.v_potential_duplicate_companies;
DROP VIEW IF EXISTS public.v_potential_duplicate_fb_shares;
```

---

## FAQ

### Q: Will this delete any data I need?
**A:** The migration keeps the **oldest record** for each duplicate set. All related data (comments, assignments, etc.) remain intact. However, always backup first!

### Q: What happens if I try to insert a duplicate after migration?
**A:** The database will reject the insert with an error message: "Company with this name and phone already exists"

### Q: Can I customize which duplicate to keep?
**A:** Yes, modify the `ORDER BY` clause in the migration. Currently it keeps the oldest (`ORDER BY created_at ASC`)

### Q: Will this affect performance?
**A:** No, the added indexes will actually **improve** performance for queries

### Q: How long does the migration take?
**A:** Depends on database size:
- < 1,000 records: < 1 second
- 1,000 - 10,000 records: 1-5 seconds
- 10,000+ records: 5-30 seconds

---

## Support

If you encounter any issues:

1. Check the Supabase logs in Dashboard → Logs
2. Verify your backup is complete
3. Review the error message carefully
4. Test in a staging environment first

---

## Best Practices Going Forward

✅ **DO:**
- Always trim and normalize input data
- Use the monitoring views regularly
- Handle duplicate errors gracefully in your app
- Validate data before submission

❌ **DON'T:**
- Allow users to submit without validation
- Bypass the duplicate checks
- Remove the unique constraints
- Ignore duplicate warnings

---

## Summary

This migration will:
- ✅ Clean up existing duplicates
- ✅ Prevent future duplicates
- ✅ Improve database performance
- ✅ Provide monitoring tools
- ✅ Maintain data integrity

**Total Time:** < 5 minutes to apply
**Risk Level:** Low (with backup)
**Benefit:** High (cleaner database, better performance)

