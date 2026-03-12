# 🧪 Deletion Cascade Testing Guide

## ✅ Quick Test Scenarios

### Test 1: Employee Deletes from Active Pool
**Steps:**
1. Log in as Employee
2. Go to "Active Pool" or "Prime Pool"
3. Click delete on any company
4. Check "Inactive Pool" section

**Expected Result:**
- ✅ Company disappears from Active/Prime Pool
- ✅ Company appears in Inactive Pool
- ✅ Company has `deletion_state = 'inactive'`

---

### Test 2: Employee Deletes from Inactive Pool
**Steps:**
1. Log in as Employee
2. Go to "Inactive Pool"
3. Click delete on a company
4. Check Inactive Pool (should be gone)
5. Log in as Team Leader
6. Check "Recycle Bin" section

**Expected Result:**
- ✅ Company disappears from Employee's Inactive Pool
- ✅ Employee CANNOT see it anymore in any section
- ✅ Company appears in Team Leader's Recycle Bin
- ✅ Company has `deletion_state = 'team_lead_recycle'`

---

### Test 3: Team Leader Deletes from Recycle Bin
**Steps:**
1. Log in as Team Leader
2. Go to "Recycle Bin"
3. Click delete on a company
4. Check Recycle Bin (should be gone)
5. Log in as Admin
6. Check "General Delete Data" or "Facebook Delete Data" section

**Expected Result:**
- ✅ Company disappears from Team Leader's Recycle Bin
- ✅ Team Leader CANNOT see it anymore
- ✅ Employee still CANNOT see it
- ✅ Company appears in Admin's Delete Data section
- ✅ Company has `deletion_state = 'admin_recycle'`

---

### Test 4: Admin Permanently Deletes
**Steps:**
1. Log in as Admin
2. Go to "General Delete Data"
3. Click permanent delete on a company
4. Confirm the action

**Expected Result:**
- ✅ Company is REMOVED from database
- ✅ Nobody can see it anymore
- ✅ Data is gone forever

---

### Test 5: Restore from Inactive Pool
**Steps:**
1. Log in as Employee
2. Go to "Inactive Pool"
3. Click restore on a company
4. Check Active Pool or appropriate category

**Expected Result:**
- ✅ Company disappears from Inactive Pool
- ✅ Company returns to its previous category (Active/Prime/General)
- ✅ Company has `deletion_state = NULL`
- ✅ All comments preserved

---

### Test 6: Team Leader Restore from Recycle Bin
**Steps:**
1. Log in as Team Leader
2. Go to "Recycle Bin"
3. Click restore on a company
4. Log in as Employee (the one who had it assigned)
5. Check the appropriate category section

**Expected Result:**
- ✅ Company disappears from Recycle Bin
- ✅ Company returns to Employee's dashboard in correct category
- ✅ Company has `deletion_state = NULL`
- ✅ Employee can see it again

---

### Test 7: Admin Restore from Delete Data
**Steps:**
1. Log in as Admin
2. Go to "General Delete Data"
3. Click restore on a company

**Expected Result:**
- ✅ Company disappears from Delete Data
- ✅ Company returns to active data pool
- ✅ Company has `deletion_state = NULL`
- ✅ If was assigned, employee can see it again

---

### Test 8: Visibility Check - Employee
**Steps:**
1. Log in as Employee
2. Check all sections

**Expected Result:**
- ✅ Can see: Active data + Inactive Pool (deletion_state='inactive')
- ❌ Cannot see: team_lead_recycle data
- ❌ Cannot see: admin_recycle data

---

### Test 9: Visibility Check - Team Leader
**Steps:**
1. Log in as Team Leader
2. Check all sections including Recycle Bin

**Expected Result:**
- ✅ Can see: All active team data + Recycle Bin (deletion_state='team_lead_recycle')
- ❌ Cannot see: admin_recycle data

---

### Test 10: Admin's "All Companies" - No Deleted Data
**Steps:**
1. Log in as Admin
2. Go to "All Companies" section
3. Verify only fresh data shows

**Expected Result:**
- ✅ Shows ONLY: Unassigned + No Comments + No deletion_state
- ❌ Does NOT show: Any data with deletion_state
- ❌ Does NOT show: Assigned data
- ❌ Does NOT show: Categorized data

---

## 🔍 SQL Queries for Verification

### Check Deletion States
```sql
SELECT 
  id,
  company_name,
  deletion_state,
  assigned_to_id,
  deleted_at,
  deleted_by_id
FROM companies
WHERE deletion_state IS NOT NULL
ORDER BY deleted_at DESC;
```

### Count by Deletion State
```sql
SELECT 
  deletion_state,
  COUNT(*) as count
FROM companies
GROUP BY deletion_state;
```

### Find Orphaned Data (Should be 0)
```sql
-- Companies with deletion_state but no deleted_at
SELECT COUNT(*) 
FROM companies 
WHERE deletion_state IS NOT NULL 
  AND deleted_at IS NULL;
```

### Audit Trail
```sql
SELECT 
  c.company_name,
  c.deletion_state,
  c.deleted_at,
  p.display_name as deleted_by,
  p.email
FROM companies c
LEFT JOIN profiles p ON c.deleted_by_id = p.id
WHERE c.deletion_state IS NOT NULL
ORDER BY c.deleted_at DESC
LIMIT 20;
```

---

## 🚨 Common Issues & Solutions

### Issue 1: "deletion_state column doesn't exist"
**Solution:**
Run migration: `supabase/migrations/20250120000002_add_deletion_state.sql`

### Issue 2: Employee can see recycle bin data
**Solution:**
Check view filters - should exclude `team_lead_recycle` and `admin_recycle`

### Issue 3: Data disappears completely
**Solution:**
Check if `deleted_at` is set when it shouldn't be. Should only use `deletion_state`.

### Issue 4: Can't delete from Inactive Pool
**Solution:**
Verify CompanyCard `handleDelete` logic checks for `isInInactive` condition

### Issue 5: Data goes to wrong recycle bin
**Solution:**
Check user role detection and deletion_state assignment logic

---

## ✅ Success Criteria

All tests should pass with these results:
- ✅ Data moves through 3 stages correctly
- ✅ Employees don't see recycle bin data
- ✅ Team Leaders don't see admin recycle data
- ✅ Restore works at every stage
- ✅ Permanent delete only works for admin
- ✅ Audit trail is complete (deleted_by_id, deleted_at)
- ✅ No data is accidentally lost

---

## 📊 Test Results Template

```
Test Date: _____________
Tester: _____________

Test 1: Employee Delete to Inactive     [ ] PASS [ ] FAIL
Test 2: Employee Delete to TL Recycle   [ ] PASS [ ] FAIL
Test 3: TL Delete to Admin Recycle      [ ] PASS [ ] FAIL
Test 4: Admin Permanent Delete          [ ] PASS [ ] FAIL
Test 5: Restore from Inactive           [ ] PASS [ ] FAIL
Test 6: TL Restore from Recycle         [ ] PASS [ ] FAIL
Test 7: Admin Restore from Delete Data  [ ] PASS [ ] FAIL
Test 8: Employee Visibility Check       [ ] PASS [ ] FAIL
Test 9: TL Visibility Check             [ ] PASS [ ] FAIL
Test 10: Admin All Companies Filter     [ ] PASS [ ] FAIL

Notes:
___________________________________________________
___________________________________________________
___________________________________________________
```

---

**Last Updated:** 2025-01-13  
**Version:** 1.0  
**Status:** Ready for Testing

