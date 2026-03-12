# Facebook Data Sharing Workflow

## Overview
This guide explains how the Facebook data sharing workflow works between employees and admins.

## Workflow Steps

### 1. Employee Requests Facebook Data
- Employee goes to **Employee Dashboard → Request Data**
- Selects "Facebook Data Request" from the dropdown
- Submits the request
- Request appears in admin's **Data Requests** section

### 2. Admin Approves and Shares Data
- Admin goes to **Admin Dashboard → Data Requests**
- Sees the Facebook data request with a "Facebook" badge
- Clicks "Approve & Share" button
- A dialog opens showing all available Facebook data entries
- Admin selects which Facebook data entries to share (can select multiple)
- Clicks "Approve & Share" button
- Request is approved and selected data is shared with the employee

### 3. Employee Views Shared Data
- Employee goes to **Employee Dashboard → Facebook Data**
- Sees only the Facebook data entries that were shared with them
- Can view details of each shared entry

## Database Structure

### Tables Used

1. **facebook_data** - Stores all Facebook data entries
   - `id` (bigint)
   - `name` (text)
   - `email` (varchar)
   - `created_at` (timestamptz)

2. **facebook_data_shares** - Tracks which data is shared with which employees
   - `id` (uuid)
   - `facebook_data_id` (bigint) - References facebook_data.id
   - `employee_id` (uuid) - References profiles.id
   - `shared_by_id` (uuid) - References profiles.id (the admin who shared)
   - `request_id` (uuid) - References data_requests.id
   - `created_at` (timestamptz)

3. **data_requests** - Stores employee requests
   - `id` (uuid)
   - `requested_by_id` (uuid)
   - `message` (text) - Contains "[Facebook Data Request]" for Facebook requests
   - `status` (enum: pending, approved, rejected)
   - `created_at` (timestamptz)

## Setup Instructions

### Step 1: Run Database Migration
Run the migration file to create the `facebook_data_shares` table:

```bash
# The migration file is located at:
supabase/migrations/20250117000002_create_facebook_data_shares.sql
```

Or run this SQL in Supabase SQL Editor:

```sql
-- Create facebook_data_shares table
CREATE TABLE IF NOT EXISTS public.facebook_data_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  shared_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.data_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(facebook_data_id, employee_id)
);

-- Enable RLS
ALTER TABLE public.facebook_data_shares ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_facebook_data_shares_employee_id ON public.facebook_data_shares(employee_id);
CREATE INDEX idx_facebook_data_shares_facebook_data_id ON public.facebook_data_shares(facebook_data_id);
CREATE INDEX idx_facebook_data_shares_request_id ON public.facebook_data_shares(request_id);

-- RLS Policies
CREATE POLICY "Employees can view their own shared facebook data"
  ON public.facebook_data_shares FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can share facebook data"
  ON public.facebook_data_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) AND
    shared_by_id = auth.uid()
  );

CREATE POLICY "Admins can delete facebook data shares"
  ON public.facebook_data_shares FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### Step 2: Verify RLS Policies
Make sure the `facebook_data` table has RLS policies allowing authenticated users to view data (for admin) and employees to view shared data.

## Features

### Admin Features
- ✅ View all Facebook data requests
- ✅ Approve/reject requests
- ✅ Select and share specific Facebook data entries when approving
- ✅ See all shared data
- ✅ Track which data was shared with which employee

### Employee Features
- ✅ Request Facebook data
- ✅ View only shared Facebook data in their dashboard
- ✅ See status of their requests

## Testing the Workflow

1. **As Employee:**
   - Go to Request Data section
   - Select "Facebook Data Request"
   - Submit request

2. **As Admin:**
   - Go to Data Requests section
   - Find the Facebook request
   - Click "Approve & Share"
   - Select Facebook data entries to share
   - Click "Approve & Share"

3. **As Employee (Again):**
   - Go to Facebook Data section
   - Verify shared data appears

## Troubleshooting

### Employee doesn't see shared data
- Check if the share was created in `facebook_data_shares` table
- Verify RLS policies allow the employee to view their shares
- Check browser console for errors

### Admin can't share data
- Verify admin has admin role in `user_roles` table
- Check RLS policies for `facebook_data_shares` table
- Verify `facebook_data` table is accessible

### Data request not showing as Facebook request
- Ensure the request message contains "[Facebook Data Request]"
- Check the `data_requests` table for the message content

