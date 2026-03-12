# 🗑️ 3-Stage Deletion Cascade System

## 📋 Overview

This system implements a **3-level soft-delete cascade** to prevent accidental data loss and provide multiple recovery points.

---

## 🎯 Deletion States

```sql
CREATE TYPE deletion_state AS ENUM (
  'inactive',            -- Stage 1: Inactive Pool (Employee)
  'team_lead_recycle',   -- Stage 2: Team Leader Recycle Bin
  'admin_recycle'        -- Stage 3: Admin Delete Data (FINAL)
);
```

---

## 🔄 Complete Deletion Flow

### Stage 1: Employee Deletes from Any Section
**Action:** Employee clicks delete on any company data  
**Result:** `deletion_state = 'inactive'`  
**Visible in:** Employee's **Inactive Pool**  
**Can recover:** ✅ Yes (employee can restore or delete again)

### Stage 2: Employee Deletes from Inactive Pool
**Action:** Employee deletes from Inactive Pool  
**Result:** `deletion_state = 'team_lead_recycle'`  
**Visible in:** Team Leader's **Recycle Bin**  
**Can recover:** ✅ Yes (team lead can restore or delete again)  
**Hidden from:** ❌ Employee (can't see anymore)

### Stage 3: Team Leader Deletes from Recycle Bin
**Action:** Team Leader deletes from Recycle Bin  
**Result:** `deletion_state = 'admin_recycle'`  
**Visible in:** Admin's **Delete Data Sections**  
**Can recover:** ✅ Yes (admin can restore)  
**Hidden from:** ❌ Employee & Team Leader  
**Final stage:** This is the last stop before permanent deletion

---

## 📊 Visual Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│                ACTIVE DATA                           │
│          (deletion_state = NULL)                     │
│                                                      │
│    • Assigned Data                                   │
│    • Prime Pool, Active Pool, General                │
└───────────────────┬──────────────────────────────────┘
                    │
                    │ Employee Deletes
                    ▼
┌─────────────────────────────────────────────────────┐
│           STAGE 1: INACTIVE POOL                     │
│      (deletion_state = 'inactive')                   │
│                                                      │
│  • Visible to: Employee only                         │
│  • Actions: Restore or Delete again                  │
│  • Recovery: Easy (1 click)                          │
└───────────────────┬──────────────────────────────────┘
                    │
                    │ Employee Deletes Again
                    ▼
┌─────────────────────────────────────────────────────┐
│      STAGE 2: TEAM LEADER RECYCLE BIN                │
│    (deletion_state = 'team_lead_recycle')            │
│                                                      │
│  • Visible to: Team Leader only                      │
│  • Hidden from: Employee                             │
│  • Actions: Restore or Delete to Admin               │
│  • Recovery: Team Lead approval needed               │
└───────────────────┬──────────────────────────────────┘
                    │
                    │ Team Leader Deletes
                    ▼
┌─────────────────────────────────────────────────────┐
│     STAGE 3: ADMIN DELETE DATA (FINAL)               │
│      (deletion_state = 'admin_recycle')              │
│                                                      │
│  • Visible to: Admin only                            │
│  • Hidden from: Employee & Team Leader               │
│  • Actions: Restore or Permanent Delete              │
│  • Recovery: Admin approval needed                   │
│  • Final archive before permanent deletion           │
└──────────────────────────────────────────────────────┘
```

---

## 🛡️ Protection Rules

### Employee View:
- ✅ **CAN SEE:** Active data & Inactive Pool (deletion_state='inactive')
- ❌ **CANNOT SEE:** team_lead_recycle, admin_recycle
- ✅ **CAN DELETE TO:** Inactive Pool (first delete), Team Leader Recycle (second delete)

### Team Leader View:
- ✅ **CAN SEE:** All active data & Team Lead Recycle (deletion_state='team_lead_recycle')
- ❌ **CANNOT SEE:** admin_recycle
- ✅ **CAN DELETE TO:** Admin Delete Data

### Admin View:
- ✅ **CAN SEE:** Everything including Admin Delete Data (deletion_state='admin_recycle')
- ✅ **CAN DELETE TO:** Permanent deletion (removes from database)

---

## 🔧 Implementation Details

### Database Schema

```sql
-- Companies table columns
companies (
  id UUID PRIMARY KEY,
  ...
  deletion_state deletion_state,  -- NULL, 'inactive', 'team_lead_recycle', 'admin_recycle'
  deleted_at TIMESTAMPTZ,         -- When deleted
  deleted_by_id UUID,              -- Who deleted it
  ...
)
```

### Deletion Logic

#### Employee Delete (First Time)
```typescript
// From any section (Assigned, Prime, Active, General)
await supabase
  .from("companies")
  .update({
    deletion_state: 'inactive',
    deleted_at: new Date().toISOString(),
    deleted_by_id: currentUser.id
  })
  .eq("id", companyId);

// Result: Appears in Inactive Pool
```

#### Employee Delete (From Inactive Pool)
```typescript
// From Inactive Pool section
await supabase
  .from("companies")
  .update({
    deletion_state: 'team_lead_recycle',
    deleted_at: new Date().toISOString(),
    deleted_by_id: currentUser.id
  })
  .eq("id", companyId);

// Result: Moves to Team Leader's Recycle Bin
// Employee can no longer see it
```

#### Team Leader Delete (From Recycle Bin)
```typescript
// From Team Leader's Recycle Bin
await supabase
  .from("companies")
  .update({
    deletion_state: 'admin_recycle',
    deleted_at: new Date().toISOString(),
    deleted_by_id: currentUser.id
  })
  .eq("id", companyId);

// Result: Moves to Admin's Delete Data
// Team Leader can no longer see it
```

#### Admin Delete (Permanent)
```typescript
// From Admin's Delete Data section
await supabase
  .from("companies")
  .delete()
  .eq("id", companyId);

// Result: Permanently removed from database
```

### Restore Logic

#### Employee Restore (From Inactive Pool)
```typescript
// Restore to active state
await supabase
  .from("companies")
  .update({
    deletion_state: null,
    deleted_at: null,
    deleted_by_id: null
  })
  .eq("id", companyId);

// Result: Returns to active data (previous category)
```

#### Team Leader Restore (From Recycle Bin)
```typescript
// Restore to active state
await supabase
  .from("companies")
  .update({
    deletion_state: null,
    deleted_at: null,
    deleted_by_id: null
  })
  .eq("id", companyId);

// Result: Returns to employee's active data
```

#### Admin Restore (From Delete Data)
```typescript
// Restore to active state
await supabase
  .from("companies")
  .update({
    deletion_state: null,
    deleted_at: null,
    deleted_by_id: null
  })
  .eq("id", companyId);

// Result: Returns to active data pool
```

---

## 📂 View Filtering

### Inactive Pool View (Employee)
```sql
WHERE assigned_to_id = employee_id
  AND deletion_state = 'inactive'
```

### Recycle Bin View (Team Leader)
```sql
WHERE deletion_state = 'team_lead_recycle'
  AND (assigned_to_id = team_lead_id 
       OR assigned_to_id IN (SELECT employee_id FROM team_members WHERE team_id = team_lead's_team))
```

### Delete Data Views (Admin)
```sql
-- General Delete Data
WHERE deletion_state = 'admin_recycle'
  AND (facebook data is NULL or conditions for company data)

-- Facebook Delete Data  
WHERE deletion_state = 'admin_recycle'
  AND (conditions for facebook data)
```

### All Active Views (All Users)
```sql
WHERE deletion_state IS NULL
  -- Regular filters apply
```

---

## ⚠️ Important Rules

### 1. **Never Skip Stages**
- ❌ Cannot go directly from active → team_lead_recycle
- ❌ Cannot go directly from inactive → admin_recycle
- ✅ Must follow: active → inactive → team_lead_recycle → admin_recycle

### 2. **Visibility Inheritance**
- Once data reaches a higher stage, lower roles cannot see it
- Employee loses access after 'team_lead_recycle'
- Team Leader loses access after 'admin_recycle'

### 3. **Restore Behavior**
- Restore always returns to `deletion_state = NULL` (active)
- Restoring preserves all original data (comments, categories, etc.)
- Original assignment stays intact

### 4. **Final Archive**
- `admin_recycle` is the **permanent archive**
- Data in admin_recycle stays there forever (unless admin permanently deletes)
- Employees never see this data again (even with new assignments)

---

## 🎯 Benefits

### For Employees:
1. ✅ Safety net with Inactive Pool
2. ✅ Easy undo (restore from inactive)
3. ✅ Clear when data is gone forever

### For Team Leaders:
1. ✅ Monitor employee deletions
2. ✅ Prevent accidental data loss
3. ✅ Control what goes to admin

### For Admins:
1. ✅ Final archive of all deleted data
2. ✅ Complete audit trail
3. ✅ Can permanently delete when needed

### For System:
1. ✅ Multiple recovery points
2. ✅ Clear data lifecycle
3. ✅ Audit trail (who deleted, when)
4. ✅ Prevents accidental loss

---

## 🚫 What This Prevents

### Before (Without Cascade):
- ❌ Accidental permanent deletions
- ❌ No recovery for employees
- ❌ Data lost forever immediately
- ❌ No oversight on deletions

### After (With Cascade):
- ✅ 3 chances to recover
- ✅ Clear approval chain
- ✅ Data preserved until admin decides
- ✅ Complete audit trail

---

## 📝 Testing Checklist

### Test Scenario 1: Employee Deletion Path
1. **Employee deletes from Active Pool**
   - ✅ Should appear in Inactive Pool
   - ✅ Should have deletion_state='inactive'
   
2. **Employee deletes from Inactive Pool**
   - ✅ Should disappear from employee view
   - ✅ Should appear in Team Leader's Recycle Bin
   - ✅ Should have deletion_state='team_lead_recycle'

3. **Team Leader deletes from Recycle Bin**
   - ✅ Should disappear from team leader view
   - ✅ Should appear in Admin's Delete Data
   - ✅ Should have deletion_state='admin_recycle'

4. **Admin permanently deletes**
   - ✅ Should be removed from database
   - ✅ Gone forever

### Test Scenario 2: Restore Path
1. **Employee restores from Inactive Pool**
   - ✅ Should return to Active Pool with same category
   - ✅ deletion_state should be NULL

2. **Team Leader restores from Recycle Bin**
   - ✅ Should return to employee's active data
   - ✅ deletion_state should be NULL

3. **Admin restores from Delete Data**
   - ✅ Should return to active data pool
   - ✅ deletion_state should be NULL

### Test Scenario 3: Visibility
1. **Check employee cannot see:**
   - ❌ team_lead_recycle data
   - ❌ admin_recycle data

2. **Check team leader cannot see:**
   - ❌ admin_recycle data

3. **Check admin can see:**
   - ✅ All deletion states

---

## 🔄 State Transition Table

| Current State | Action | New State | Visible To |
|--------------|--------|-----------|------------|
| NULL (active) | Employee Delete | 'inactive' | Employee (Inactive Pool) |
| 'inactive' | Employee Delete | 'team_lead_recycle' | Team Leader (Recycle Bin) |
| 'inactive' | Employee Restore | NULL | Employee (Active) |
| 'team_lead_recycle' | Team Lead Delete | 'admin_recycle' | Admin (Delete Data) |
| 'team_lead_recycle' | Team Lead Restore | NULL | Employee (Active) |
| 'admin_recycle' | Admin Delete | DELETED | Nobody (removed) |
| 'admin_recycle' | Admin Restore | NULL | Active Data Pool |

---

## 🛠️ Maintenance

### Check Deletion States
```sql
-- Count companies by deletion state
SELECT 
  deletion_state,
  COUNT(*) as count
FROM companies
GROUP BY deletion_state;
```

### Find Stuck Data
```sql
-- Companies deleted more than 90 days ago
SELECT 
  id, 
  company_name, 
  deletion_state, 
  deleted_at
FROM companies
WHERE deletion_state = 'admin_recycle'
  AND deleted_at < NOW() - INTERVAL '90 days';
```

### Audit Trail
```sql
-- See who deleted what
SELECT 
  c.id,
  c.company_name,
  c.deletion_state,
  c.deleted_at,
  p.display_name as deleted_by
FROM companies c
LEFT JOIN profiles p ON c.deleted_by_id = p.id
WHERE c.deletion_state IS NOT NULL
ORDER BY c.deleted_at DESC;
```

---

## 📞 Support

If deletion cascade is not working:
1. Check `deletion_state` column exists in database
2. Verify enum values: 'inactive', 'team_lead_recycle', 'admin_recycle'
3. Check user role permissions
4. Review filter logic in each view
5. Check browser console for errors

---

**Last Updated:** 2025-01-13  
**Version:** 1.0  
**Status:** Ready for Implementation

