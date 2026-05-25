# 🚀 Quick Start: Remove Duplicates from Supabase Database

## ⚡ TL;DR - Fast Track

```bash
# 1. Backup your database (IMPORTANT!)
# Go to Supabase Dashboard → Settings → Database → Create Backup

# 2. Check for duplicates (Optional)
# Run: supabase/migrations/verify_duplicates.sql in SQL Editor

# 3. Apply the migration
supabase db push

# 4. Verify success
# Run verify_duplicates.sql again - should show 0 duplicates
```

---

## 📋 Step-by-Step Guide

### Step 1: Backup Your Database ⚠️
**THIS IS CRITICAL - DON'T SKIP!**

1. Open your [Supabase Dashboard](https://app.supabase.com)
2. Go to **Settings** → **Database**
3. Click **"Create Backup"** button
4. Wait for confirmation (usually < 1 minute)

### Step 2: Check for Duplicates (Optional but Recommended)

**Option A: Using Supabase Dashboard**
1. Go to **SQL Editor** in your Supabase Dashboard
2. Click **"New Query"**
3. Copy and paste the contents of `supabase/migrations/verify_duplicates.sql`
4. Click **"Run"**
5. Review the results to see how many duplicates exist

**Option B: Quick Check Query**
```sql
-- Just see if you have duplicates
SELECT 
  'Duplicate Companies' as type,
  COUNT(*) as sets
FROM (
  SELECT company_name, phone
  FROM companies
  GROUP BY company_name, phone
  HAVING COUNT(*) > 1
) sub;
```

### Step 3: Apply the Migration

**Option A: Using Supabase CLI (Recommended)**
```bash
# If you haven't installed Supabase CLI
npm install -g supabase

# Link your project (one time only)
supabase link --project-ref your-project-ref

# Apply all pending migrations
supabase db push
```

**Option B: Using Supabase Dashboard**
1. Go to **SQL Editor**
2. Click **"New Query"**
3. Copy contents of `supabase/migrations/20250113000001_remove_duplicates_and_add_constraints.sql`
4. Paste into editor
5. Click **"Run"**
6. Wait for success message

### Step 4: Verify Success ✅

Run the verification script again:
```bash
# Should show 0 duplicates now
```

Or quick check in SQL Editor:
```sql
-- Check monitoring views (should be empty)
SELECT * FROM v_potential_duplicate_companies;
SELECT * FROM v_potential_duplicate_fb_shares;
```

### Step 5: Test Duplicate Prevention

Try to create a duplicate company (should fail):
```sql
-- This should give an error
INSERT INTO companies (company_name, owner_name, phone, created_by_id)
SELECT company_name, owner_name, phone, created_by_id
FROM companies LIMIT 1;
```

Expected result: ❌ Error: "Company with this name and phone already exists"

---

## 📊 What Gets Fixed

| Category | What's Removed | Prevention Added |
|----------|---------------|------------------|
| **Companies** | Duplicate company names + phone | Unique constraint + trigger |
| **Comments** | Duplicate comments (same text/user) | Automatic on insert |
| **FB Shares** | Duplicate Facebook data shares | Already has constraint |
| **FB Comments** | Duplicate Facebook comments | Automatic on insert |
| **Team Members** | Duplicate team memberships | Already has constraint |
| **User Roles** | Duplicate role assignments | Already has constraint |

---

## 🔧 Troubleshooting

### Error: "relation already exists"
**Solution:** The migration was already applied. Check if duplicates are gone:
```sql
SELECT * FROM v_potential_duplicate_companies;
```

### Error: "permission denied"
**Solution:** Make sure you're logged in as the database owner or have admin access.

### Migration seems stuck
**Solution:** 
1. Check the Supabase logs: Dashboard → Logs
2. Verify your internet connection
3. Try running in the SQL Editor directly

### Want to undo the migration
**Solution:**
1. Restore from the backup you created
2. OR manually remove constraints (see README_DUPLICATE_REMOVAL.md)

---

## 🎯 After Migration

### Update Your Application Code

Add validation before creating companies:

```typescript
// Example: Check before creating
const createCompany = async (data: CompanyData) => {
  try {
    const { data: company, error } = await supabase
      .from('companies')
      .insert(data)
      .select()
      .single();
    
    if (error) {
      if (error.message.includes('already exists')) {
        throw new Error('This company already exists in the system');
      }
      throw error;
    }
    
    return company;
  } catch (error) {
    // Handle error appropriately
    console.error('Error creating company:', error);
    throw error;
  }
};
```

### Set Up Monitoring

Check for duplicates weekly:
```sql
-- Add this to your monitoring dashboard
SELECT 
  'Companies' as type, 
  COUNT(*) as duplicates 
FROM v_potential_duplicate_companies
UNION ALL
SELECT 
  'FB Shares', 
  COUNT(*) 
FROM v_potential_duplicate_fb_shares;
```

---

## ⏱️ Expected Duration

- **Backup:** 30 seconds - 2 minutes
- **Verification Check:** 5-10 seconds
- **Migration:** 5-30 seconds (depending on DB size)
- **Verification:** 5-10 seconds
- **Total:** ~5 minutes

---

## 📈 Expected Results

### Before Migration
```
Companies: 1,500 records
- Duplicates: 150 records (100 duplicate sets)

Comments: 5,000 records
- Duplicates: 250 records

Total records: 6,500
```

### After Migration
```
Companies: 1,350 records (-150)
- Duplicates: 0 records ✅

Comments: 4,750 records (-250)
- Duplicates: 0 records ✅

Total records: 6,100 (-400 duplicates removed)
```

---

## 🆘 Need Help?

1. **Check the detailed guide:** `supabase/migrations/README_DUPLICATE_REMOVAL.md`
2. **Review Supabase logs:** Dashboard → Logs
3. **Run verification script:** `verify_duplicates.sql`
4. **Check your backup:** Make sure it completed successfully

---

## ✅ Success Checklist

- [ ] Database backup created
- [ ] Ran verification script (before)
- [ ] Applied migration successfully
- [ ] Ran verification script (after) - shows 0 duplicates
- [ ] Tested duplicate prevention - got expected error
- [ ] Updated application code to handle errors
- [ ] Set up monitoring for future duplicates

---

## 🎉 Done!

Your database is now clean and protected against future duplicates!

**Key Benefits:**
- ✅ No more duplicate data
- ✅ Better database performance
- ✅ Automatic duplicate prevention
- ✅ Monitoring tools in place
- ✅ Data integrity maintained

**Next Steps:**
1. Update your application to handle duplicate errors gracefully
2. Add validation on the frontend
3. Monitor the views weekly
4. Enjoy your clean database! 🎊

