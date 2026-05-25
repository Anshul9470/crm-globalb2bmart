import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Share2, Inbox, User, Mail, Calendar, Trash2, RefreshCw, AlertCircle, Edit, Pencil, MessageSquare, Clock, Plus, Upload, ClipboardPaste, ListPlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FacebookDataCard from "./FacebookDataCard";

interface FacebookDataViewProps {
  userId: string;
  userRole?: string;
}

interface FacebookData {
  id: number;
  name: string | null;
  email: string | null;
  phone?: string | null;
  company_name?: string | null;
  owner_name?: string | null;
  products?: string | null;
  services?: string | null;
  created_at: string; // Original upload date
  shared_at?: string | null; // Date when data was shared (for admin dashboard)
  assigned_to?: {
    display_name: string;
    email: string;
  } | null;
  comments?: FacebookComment[];
}

interface FacebookComment {
  id: string;
  comment_text: string;
  category: "follow_up" | "hot" | "block" | "general";
  comment_date?: string | null;
  created_at: string;
  user_id: string;
  user?: {
    display_name: string;
    email: string;
  };
}

const FacebookDataCardSkeleton = () => (
  <Card>
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </CardContent>
  </Card>
);

const FacebookDataView = ({ userId, userRole }: FacebookDataViewProps) => {
  const [facebookData, setFacebookData] = useState<FacebookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareIdMap, setShareIdMap] = useState<Record<number, string>>({});
  const [shareDateMap, setShareDateMap] = useState<Record<number, string>>({});

  // Edit request states
  const [editRequestDialogOpen, setEditRequestDialogOpen] = useState(false);
  const [requestingEditData, setRequestingEditData] = useState<FacebookData | null>(null);
  const [editRequestMessage, setEditRequestMessage] = useState("");
  const [editRequestFormData, setEditRequestFormData] = useState({
    company_name: "",
    owner_name: "",
    phone: "",
    email: "",
    products: "",
    services: ""
  });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [approvedEditRequests, setApprovedEditRequests] = useState<Set<number>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newFacebookData, setNewFacebookData] = useState({
    name: "",
    email: "",
    phone: "",
    company_name: "",
    owner_name: "",
    products: "",
    services: ""
  });
  const [bulkData, setBulkData] = useState("");
  const [importing, setImporting] = useState(false);
  const [addingSingle, setAddingSingle] = useState(false);

  useEffect(() => {
    fetchFacebookData();
    fetchApprovedEditRequests();
  }, [userId, userRole]);

  const fetchApprovedEditRequests = async () => {
    try {
      const { data, error } = await (supabase
        .from("facebook_data_edit_requests" as any)
        .select("facebook_data_id")
        .eq("requested_by_id", userId)
        .eq("status", "approved") as any);

      if (error) {
        console.error("Error fetching approved edit requests:", error);
        return;
      }

      const approvedIds = new Set<number>((data || []).map((r: any) => Number(r.facebook_data_id)));
      setApprovedEditRequests(approvedIds);
    } catch (error) {
      console.error("Error in fetchApprovedEditRequests:", error);
    }
  };

  const fetchFacebookData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log("🔍 Starting to fetch Facebook data...");
      console.log("👤 Current user:", userId, "Role:", userRole);

      // Check authentication first
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log("🔐 Auth check:", { user: user?.id, email: user?.email, authError });

      if (authError || !user) {
        throw new Error("Not authenticated. Please log in again.");
      }

      let data: any;
      let queryError = null;
      let shareDateMapLocal: Record<number, string> = {};
      let hadShares = false;

      if (userRole === "admin") {
        // Admin can see ALL Facebook data (both shared and unshared)
        console.log("👑 Fetching as admin (all Facebook data)...");

        // First, get all Facebook data (without comments first to avoid errors)
        const allDataResult = await (supabase
          .from("facebook_data" as any)
          .select("*")
          .order("created_at", { ascending: true }) as any);

        if (allDataResult.error) {
          data = [];
          queryError = allDataResult.error;
        } else {
          // Fetch share dates for admin to show when data was shared
          let adminShareDateMap: Record<number, string> = {};
          if (allDataResult.data && allDataResult.data.length > 0) {
            try {
              const dataIds = allDataResult.data.map((item: any) => item.id);

              // Fetch all shares for these Facebook data items
              const sharesResult = await (supabase
                .from("facebook_data_shares" as any)
                .select("facebook_data_id, created_at")
                .in("facebook_data_id", dataIds) as any);

              if (!sharesResult.error && sharesResult.data) {
                // Create a map of facebook_data_id to the earliest share date (first time it was shared)
                sharesResult.data.forEach((share: any) => {
                  if (share.created_at) {
                    const existingDate = adminShareDateMap[share.facebook_data_id];
                    if (!existingDate || new Date(share.created_at) < new Date(existingDate)) {
                      // Use the earliest share date (first time it was shared)
                      adminShareDateMap[share.facebook_data_id] = share.created_at;
                    }
                  }
                });
              }
            } catch (sharesError) {
              console.warn("Could not fetch share dates (table may not exist yet):", sharesError);
              // Continue without share dates
            }
          }

          // Store admin share date map for use in mapping
          shareDateMapLocal = adminShareDateMap;

          // Try to fetch comments separately for each item (gracefully handle if table doesn't exist)
          if (allDataResult.data && allDataResult.data.length > 0) {
            try {
              const dataIds = allDataResult.data.map((item: any) => item.id);
              const commentsResult = await (supabase
                .from("facebook_data_comments" as any)
                .select(`
          id,
                  facebook_data_id,
          comment_text,
          category,
          comment_date,
          created_at,
          user_id,
                  user:profiles!user_id(display_name, email)
                `)
                .in("facebook_data_id", dataIds) as any);

              // If comments fetch succeeded, attach them to data
              if (!commentsResult.error && commentsResult.data) {
                const commentsMap = new Map();
                commentsResult.data.forEach((comment: any) => {
                  if (!commentsMap.has(comment.facebook_data_id)) {
                    commentsMap.set(comment.facebook_data_id, []);
                  }
                  commentsMap.get(comment.facebook_data_id).push(comment);
                });

                // Attach comments to each data item
                allDataResult.data = allDataResult.data.map((item: any) => ({
                  ...item,
                  comments: (commentsMap.get(item.id) || []).sort((a: any, b: any) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  )
                }));
              }
              // If comments table doesn't exist, just continue without comments (no error)
            } catch (commentsError) {
              console.warn("Could not fetch comments (table may not exist yet):", commentsError);
              // Continue without comments
            }
          }

          // Show all data (both shared and unshared) for admin
          // Exclude items with deletion_state set (they're in inactive or recycle bins)
          data = (allDataResult.data || []).filter((item: any) =>
            !item.deletion_state || item.deletion_state === null
          );
          queryError = null;

          console.log("📋 Admin query result:", {
            totalData: data.length,
            error: queryError,
            shareDatesCount: Object.keys(adminShareDateMap).length
          });
        }
      } else {
        // Employees can only see shared Facebook data
        console.log("👤 Fetching as employee...");
        console.log("🔍 Looking for shares for employee ID:", userId);

        // First, get the share IDs for this employee
        const sharesResult = await (supabase
          .from("facebook_data_shares" as any)
          .select("facebook_data_id, id, created_at")
          .eq("employee_id", userId) as any);

        console.log("📦 Shares query result:", {
          shares: sharesResult.data,
          sharesCount: sharesResult.data?.length,
          error: sharesResult.error
        });

        if (sharesResult.error) {
          // Check if table doesn't exist
          if (sharesResult.error.code === "PGRST205" || sharesResult.error.message?.includes("could not find")) {
            // Table doesn't exist yet - show helpful message
            console.error("❌ facebook_data_shares table not found");
            data = [];
            queryError = {
              ...sharesResult.error,
              message: "facebook_data_shares table not found. Please run the migration to create it.",
              isTableMissing: true
            };
          } else {
            console.error("❌ Error fetching shares:", sharesResult.error);
            data = [];
            queryError = sharesResult.error;
          }
        } else if (!sharesResult.data || sharesResult.data.length === 0) {
          // No shares found - this is normal, employee just has no shared data yet
          console.log("ℹ️ No shares found for this employee - they haven't received any shared data yet");
          data = [];
          queryError = null;
          setShareIdMap({});
        } else {
          // Build share ID map for edit requests and share date map
          const shareMap: Record<number, string> = {};
          shareDateMapLocal = {}; // Reset and populate with share dates
          sharesResult.data.forEach((share: any) => {
            shareMap[share.facebook_data_id] = share.id;
            // Store the share date (when admin shared it) instead of original created_at
            if (share.created_at) {
              shareDateMapLocal[share.facebook_data_id] = share.created_at;
            }
          });
          setShareIdMap(shareMap);
          setShareDateMap(shareDateMapLocal);
          hadShares = sharesResult.data.length > 0;

          // Get the actual Facebook data for the shared IDs
          const facebookDataIds = sharesResult.data.map((share: any) => share.facebook_data_id);
          console.log("🔍 Fetching Facebook data for IDs:", facebookDataIds);

          const facebookDataResult = await (supabase
            .from("facebook_data" as any)
            .select("*")
            .in("id", facebookDataIds)
            .order("created_at", { ascending: true }) as any);

          console.log("📋 Facebook data query result:", {
            dataLength: facebookDataResult.data?.length,
            error: facebookDataResult.error,
            data: facebookDataResult.data
          });

          if (facebookDataResult.error) {
            data = [];
            queryError = facebookDataResult.error;
          } else {
            // Exclude items with deletion_state set (they're in inactive or recycle bins)
            data = (facebookDataResult.data || []).filter((item: any) =>
              !item.deletion_state || item.deletion_state === null
            );

            // Try to fetch comments separately (gracefully handle if table doesn't exist)
            if (data.length > 0) {
              try {
                const commentsResult = await (supabase
                  .from("facebook_data_comments" as any)
                  .select(`
                    id,
                    facebook_data_id,
                    comment_text,
                    category,
                    comment_date,
                    created_at,
                    user_id,
                    user:profiles!user_id(display_name, email)
                  `)
                  .in("facebook_data_id", facebookDataIds) as any);

                // If comments fetch succeeded, attach them to data
                if (!commentsResult.error && commentsResult.data) {
                  const commentsMap = new Map();
                  commentsResult.data.forEach((comment: any) => {
                    if (!commentsMap.has(comment.facebook_data_id)) {
                      commentsMap.set(comment.facebook_data_id, []);
                    }
                    commentsMap.get(comment.facebook_data_id).push(comment);
                  });

                  // Attach comments to each data item
                  data = data.map((item: any) => ({
                    ...item,
                    comments: (commentsMap.get(item.id) || []).sort((a: any, b: any) =>
                      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    )
                  }));
                }
                // If comments table doesn't exist, just continue without comments (no error)
              } catch (commentsError) {
                console.warn("Could not fetch comments (table may not exist yet):", commentsError);
                // Continue without comments - add empty array
                data = data.map((item: any) => ({
                  ...item,
                  comments: []
                }));
              }
            }

            queryError = null;
          }
        }
      }

      console.log("📊 Query result:", {
        hasData: !!data,
        dataLength: data?.length,
        error: queryError,
        sampleData: data?.[0],
        dataType: typeof data,
        isArray: Array.isArray(data),
        fullData: data
      });

      if (queryError) {
        console.error("❌ Error fetching Facebook data:", queryError);
        console.error("📋 Full error object:", JSON.stringify(queryError, null, 2));
        const errorMsg = queryError.message || "Failed to fetch Facebook data";
        const errorCode = queryError.code || queryError.error_code || "";
        const errorDetails = queryError.details || queryError.hint || "";

        setError(errorMsg);
        setFacebookData([]);

        // Show specific error messages
        if (queryError.isTableMissing || errorCode === "PGRST205") {
          toast.error("facebook_data_shares table not found. Please run the migration.", {
            duration: 10000
          });
        } else if (errorCode === "42501" || errorMsg?.includes("permission denied")) {
          toast.error("Permission denied. Check RLS policies for facebook_data table.");
          console.error("🔒 RLS Error - Need to add policies. Error details:", queryError);
        } else if (errorCode === "PGRST116" || errorMsg?.includes("does not exist")) {
          toast.error("The facebook_data table does not exist.");
        } else if (errorCode === "42703" || errorMsg?.includes("column") || errorMsg?.includes("does not exist")) {
          toast.error("Table structure mismatch. Please check database schema.", {
            duration: 10000
          });
          console.error("🔍 Schema Error - Table or column may be missing:", {
            code: errorCode,
            message: errorMsg,
            details: errorDetails
          });
        } else if (errorCode === "400" || errorCode === "PGRST301" || errorMsg?.includes("400")) {
          toast.error("Bad request. Check if facebook_data_comments table exists. Comments may not be available yet.", {
            duration: 8000
          });
          console.error("🔍 400 Error - Possible causes:", {
            code: errorCode,
            message: errorMsg,
            details: errorDetails,
            hint: "The comments table may not exist yet. This is not critical - data will load without comments."
          });
        } else {
          toast.error(`Error: ${errorMsg}${errorDetails ? ` (${errorDetails})` : ''}`);
        }
      } else if (data) {
        // Handle different data formats - check if it's an array
        const dataArray = Array.isArray(data) ? data : (data ? [data] : []);

        console.log(`✅ Successfully fetched ${dataArray.length} Facebook data entries`);
        console.log("🔍 Raw data array:", dataArray);

        if (dataArray.length === 0 && !queryError && (userRole === "admin" || hadShares)) {
          // Query succeeded but returned empty array - RLS is likely blocking rows
          console.warn("⚠️ Query returned empty array - RLS policies are filtering out all rows");
          console.warn("💡 The table has data but RLS is blocking access");
          console.warn("🔍 Debug info:", {
            userRole,
            userId,
            authenticated: !!user,
            queryRan: true,
            hadShares
          });

          setFacebookData([]);

          // Only show RLS error if we are sure it's a policy issue
          // For Admin, it's a policy issue if they see 0 rows but table might have data
          // For Employee, it's a policy issue if they have shares but see 0 rows
          setError("No data returned. RLS policies may be blocking access. See console for details.");

          toast.error("RLS policies blocking data access. The policy might not be active. Check SQL Editor.", {
            duration: 10000
          });
        } else if (dataArray.length === 0 && !queryError && userRole !== "admin" && !hadShares) {
          // No shares found - this is normal
          console.log("ℹ️ No data entries found because no data is shared with this employee");
          setFacebookData([]);
          setError(null);
        } else {
          // Map the data to our interface
          let typedData: FacebookData[];

          if (userRole === "admin") {
            // For admin, data comes directly from facebook_data table
            // Keep both original upload date and share date
            typedData = dataArray.map((item: any) => ({
              id: item.id,
              name: item.name || null,
              email: item.email || null,
              phone: item.phone || null,
              company_name: item.company_name || null,
              owner_name: item.owner_name || null,
              products: item.products || null,
              services: item.services || null,
              // Keep original upload date
              created_at: item.created_at || new Date().toISOString(),
              // Add share date if available (when data was first shared)
              shared_at: shareDateMapLocal[item.id] || null,
              assigned_to: item.assigned_to || null,
              comments: (item.comments || []).sort((a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              ),
            }));
          } else {
            // For employees, data comes directly from facebook_data table (already filtered by shared IDs)
            // We also hide entries whose latest comment category is "block" (Inactive),
            // and exclude items with deletion_state set (they're in inactive or recycle bins)
            // so that deleted items disappear from the main Facebook Data section but
            // still appear in the Inactive category views.
            const employeeVisibleData = dataArray.filter((item: any) => {
              // Exclude items with deletion_state set
              if (item.deletion_state) return false;

              const sortedComments = (item.comments || []).slice().sort(
                (a: any, b: any) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
              const latest = sortedComments[0];
              return !(latest && latest.category === "block");
            });

            typedData = employeeVisibleData.map((item: any) => ({
              id: item.id,
              name: item.name || null,
              email: item.email || null,
              phone: item.phone || null,
              company_name: item.company_name || null,
              owner_name: item.owner_name || null,
              products: item.products || null,
              services: item.services || null,
              // Use share date if available (when admin shared it), otherwise fall back to original created_at
              created_at: shareDateMapLocal[item.id] || item.created_at || new Date().toISOString(),
              assigned_to: null, // Not applicable for shared data
              comments: (item.comments || []).sort((a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              ),
            }));
          }

          // For employees, hide entries if they have been "worked on" (new comment after sharing)
          let finalData = typedData;
          if (userRole !== "admin") {
            finalData = typedData.filter((item) => {
              if (!item.comments || item.comments.length === 0) return true;
              
              const sharedAt = shareDateMap[item.id] ? new Date(shareDateMap[item.id]).getTime() : 0;
              const latestCommentAt = new Date(item.comments[0].created_at).getTime();
              
              // It's "worked on" if the latest comment is newer than the sharing
              const isWorkedOn = latestCommentAt > sharedAt + 1000;
              
              return !isWorkedOn;
            });
          }

          console.log("📝 Mapped data:", typedData);
          console.log(`✅ Setting ${finalData.length} Facebook data entries for ${userRole}`);

          setFacebookData(finalData);
          setError(null);
        }
      } else {
        console.warn("⚠️ No data returned from query");
        setFacebookData([]);
      }
    } catch (err: any) {
      console.error("💥 Exception in fetchFacebookData:", err);
      const errorMessage = err.message || "Failed to fetch Facebook data";
      setError(errorMessage);
      setFacebookData([]);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      console.log("🏁 Fetch completed");
    }
  };

  const handleDelete = async (data: FacebookData) => {
    if (!confirm("Are you sure you want to delete this Facebook data entry?")) {
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error("Not authenticated");
      }

      // For employees, "delete" should move the Facebook data to Inactive (block) category
      // by adding a block comment and setting deletion_state to 'inactive'
      if (userRole !== "admin") {
        const commentCategory = "block" as "block";

        // Add block comment
        const { error: commentError } = await (supabase
          .from("facebook_data_comments" as any)
          .insert([{
            facebook_data_id: data.id,
            user_id: userData.user.id,
            comment_text: "Moved to Inactive by employee",
            category: commentCategory,
            comment_date: new Date().toISOString().slice(0, 10),
          }]) as any);

        if (commentError) {
          console.error("Error moving Facebook data to inactive via comment:", commentError);
          throw commentError;
        }

        // Set deletion_state to 'admin_recycle' so it appears in BOTH:
        // 1. Employee's Inactive Pool (via the 'block' comment category)
        // 2. Admin's Facebook Delete Data section (via deletion_state='admin_recycle')
        const { error: updateError } = await (supabase
          .from("facebook_data" as any)
          .update({
            deletion_state: 'admin_recycle' as any,
            deleted_at: new Date().toISOString(),
            deleted_by_id: userData.user.id
          })
          .eq("id", data.id) as any);

        if (updateError) {
          console.error("Error setting deletion_state:", updateError);

          // Check if columns don't exist (migration not run)
          if (updateError.message?.includes("deleted_at") ||
            updateError.message?.includes("deletion_state") ||
            updateError.message?.includes("deleted_by_id") ||
            updateError.code === "PGRST204") {
            toast.error(
              "Database migration not applied. Please run the migration: 20250120000003_add_deletion_state_to_facebook_data.sql in Supabase SQL Editor.",
              { duration: 10000 }
            );
            console.error("Migration required. Run: supabase/migrations/20250120000003_add_deletion_state_to_facebook_data.sql");
            // Continue - the comment was added, so data will still move to inactive via comment
            return;
          }

          // Continue even if update fails - the comment was added
        }

        toast.success("Facebook data moved to Inactive section (also visible to Admin in Delete Data)");
        fetchFacebookData();

        // Dispatch event to refresh all category views (Prime Pool, Active Pool, etc.)
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("facebookDataUpdated"));
        }
        return;
      }

      // Admins: move to admin_recycle instead of hard delete
      const { error: updateError } = await (supabase
        .from("facebook_data" as any)
        .update({
          deletion_state: 'admin_recycle' as any,
          deleted_at: new Date().toISOString(),
          deleted_by_id: userData.user.id
        })
        .eq("id", data.id) as any);

      if (updateError) {
        console.error("Error setting deletion_state for Facebook data:", updateError);

        // Check if columns don't exist (migration not run)
        if (updateError.message?.includes("deleted_at") ||
          updateError.message?.includes("deletion_state") ||
          updateError.message?.includes("deleted_by_id") ||
          updateError.code === "PGRST204") {

          toast.error(
            "Database migration not applied. Please run the migration: 20250120000003_add_deletion_state_to_facebook_data.sql. Falling back to permanent delete.",
            { duration: 10000 }
          );

          // Fallback: hard delete
          const { error: deleteError } = await (supabase
            .from("facebook_data" as any)
            .delete()
            .eq("id", data.id) as any);

          if (deleteError) throw deleteError;
          toast.success("Facebook data permanently deleted (migration missing for recycle bin)");
        } else {
          throw updateError;
        }
      } else {
        toast.success("Facebook data moved to recycle bin");
      }

      fetchFacebookData();

      // Dispatch events to refresh counts
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("facebookDataUpdated"));
      }
      return;
    } catch (error: any) {
      console.error("Error deleting Facebook data:", error);
      toast.error(error.message || "Failed to delete Facebook data");
    }
  };

  // No direct edit handlers as everyone uses requests now

  // Employee edit request functionality
  const handleRequestEditClick = (data: FacebookData) => {
    setRequestingEditData(data);
    setEditRequestMessage("");
    // Pre-fill form with existing data if available
    setEditRequestFormData({
      company_name: data.company_name || "",
      owner_name: data.owner_name || "",
      phone: data.phone || "",
      email: data.email || "",
      products: data.products || "",
      services: data.services || ""
    });
    setEditRequestDialogOpen(true);
  };

  const handleSubmitEditRequest = async () => {
    if (!requestingEditData) return;

    // Validate required fields (services is optional)
    if (!editRequestFormData.company_name.trim() ||
      !editRequestFormData.owner_name.trim() ||
      !editRequestFormData.phone.trim() ||
      !editRequestFormData.email.trim() ||
      !editRequestFormData.products.trim()) {
      toast.error("Please fill in all required fields (Company Name, Owner Name, Phone, Email, Products)");
      return;
    }

    setSubmittingRequest(true);
    try {
      const shareId = shareIdMap[requestingEditData.id];
      console.log("🔍 Edit request submission:", {
        facebookDataId: requestingEditData.id,
        shareId: shareId,
        shareIdMap: shareIdMap,
        userId: userId
      });

      if (!shareId) {
        toast.error("Share ID not found. Please refresh the page and try again.");
        console.error("❌ Share ID not found in shareIdMap for Facebook data ID:", requestingEditData.id);
        setSubmittingRequest(false);
        return;
      }

      const { error } = await (supabase
        .from("facebook_data_edit_requests" as any)
        .insert([{
          facebook_data_id: requestingEditData.id,
          facebook_data_share_id: shareId,
          requested_by_id: userId,
          request_message: editRequestMessage.trim() || "Edit request with submitted data",
          status: "pending",
          company_name: editRequestFormData.company_name.trim(),
          owner_name: editRequestFormData.owner_name.trim(),
          phone: editRequestFormData.phone.trim(),
          email: editRequestFormData.email.trim(),
          products: editRequestFormData.products.trim(),
          services: editRequestFormData.services.trim() || null,
        }]) as any);

      if (error) {
        console.error("❌ Error submitting edit request:", error);
        console.error("📋 Full error object:", JSON.stringify(error, null, 2));

        const errorMessage = (error.message || "").toLowerCase();
        const errorCode = error.code || "";
        const errorStatus = (error as any).status || (error as any).statusCode;
        const errorDetails = error.details || error.hint || "";

        console.log("🔍 Error analysis:", {
          code: errorCode,
          status: errorStatus,
          message: errorMessage,
          details: errorDetails,
          fullError: error
        });

        // Check for foreign key constraint violation FIRST (most common)
        if (
          errorCode === "23503" ||
          errorMessage.includes("foreign key") ||
          errorMessage.includes("violates foreign key constraint") ||
          errorMessage.includes("key constraint")
        ) {
          toast.error(
            `Foreign key error: The share ID may not exist. Error: ${error.message || errorCode}. Please refresh the page and try again.`,
            { duration: 12000 }
          );
          console.error("🔗 Foreign key constraint violation:", error);
          return;
        }

        // Check for RLS policy violation
        if (
          errorCode === "42501" ||
          errorMessage.includes("permission denied") ||
          errorMessage.includes("row-level security") ||
          errorMessage.includes("policy")
        ) {
          toast.error(
            `Permission denied: ${error.message || "RLS policy is blocking this operation"}. Please check RLS policies.`,
            { duration: 12000 }
          );
          console.error("🔒 RLS policy violation:", error);
          return;
        }

        // Check for validation/constraint errors
        if (
          errorCode === "23514" ||
          errorCode === "23502" ||
          errorMessage.includes("violates check constraint") ||
          errorMessage.includes("null value") ||
          errorMessage.includes("not null")
        ) {
          toast.error(
            `Validation error: ${error.message || errorDetails || "Please check all required fields are filled correctly."}`,
            { duration: 10000 }
          );
          console.error("✅ Validation error:", error);
          return;
        }

        // Check if table doesn't exist (ONLY if it's actually a table not found error)
        if (
          (errorCode === "PGRST205" && errorMessage.includes("table")) ||
          (errorCode === "42P01" && errorMessage.includes("relation")) ||
          (errorStatus === 404 && errorMessage.includes("not found") && errorMessage.includes("table")) ||
          (errorMessage.includes("relation") && errorMessage.includes("does not exist") && errorMessage.includes("facebook_data_edit_requests"))
        ) {
          toast.error(
            "The edit requests table is not found. Please run the SQL script: create_facebook_data_edit_requests_table.sql in Supabase SQL Editor.",
            { duration: 12000 }
          );
          console.error("📋 Table missing. Run: create_facebook_data_edit_requests_table.sql");
          return;
        }

        // Generic error with all details
        const displayMessage = error.message || errorCode || "Unknown error";
        toast.error(
          `Failed to submit edit request: ${displayMessage}${errorDetails ? ` (Details: ${errorDetails})` : ''}`,
          { duration: 15000 }
        );
        console.error("❌ Error details:", {
          code: errorCode,
          status: errorStatus,
          message: error.message,
          details: errorDetails,
          fullError: error
        });
        return;
      }

      toast.success("Edit request sent successfully. Waiting for admin approval.");
      setEditRequestDialogOpen(false);
      setRequestingEditData(null);
      setEditRequestMessage("");
      setEditRequestFormData({
        company_name: "",
        owner_name: "",
        phone: "",
        email: "",
        products: "",
        services: ""
      });
      fetchApprovedEditRequests(); // Refresh approved requests
    } catch (error: any) {
      console.error("Error submitting edit request:", error);
      if (error.message && !error.message.includes("migration")) {
        toast.error(error.message || "Failed to submit edit request");
      }
    } finally {
      setSubmittingRequest(false);
    }
  };

  // No separate employee edit step after approval:
  // when admin approves an edit request, the approved data is applied
  // directly to the facebook_data row in EditRequestsView.

  const handleAddSingle = async () => {
    if (!newFacebookData.company_name.trim() || !newFacebookData.phone.trim()) {
      toast.error("Company Name and Phone are required");
      return;
    }

    setAddingSingle(true);
    try {
      // 1. Insert into facebook_data
      const { data: fbResult, error: fbError } = await (supabase
        .from("facebook_data" as any)
        .insert([newFacebookData])
        .select() as any);

      if (fbError) throw fbError;

      toast.success("Data added to Facebook successfully");
      setAddDialogOpen(false);
      setNewFacebookData({
        name: "", email: "", phone: "", company_name: "", owner_name: "", products: "", services: ""
      });
      fetchFacebookData();
    } catch (error: any) {
      toast.error(error.message || "Failed to add data");
    } finally {
      setAddingSingle(false);
    }
  };

  const parseBulkData = (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return [];

    const headers = lines[0].split(/[,\t]/).map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const values = line.split(/[,\t]/).map(v => v.trim());
      const obj: any = {};
      headers.forEach((header, index) => {
        if (header.includes("name") && !header.includes("owner") && !header.includes("company")) obj.name = values[index];
        else if (header.includes("company") || header.includes("business")) obj.company_name = values[index];
        else if (header.includes("owner")) obj.owner_name = values[index];
        else if (header.includes("phone") || header.includes("mobile")) obj.phone = values[index];
        else if (header.includes("email")) obj.email = values[index];
        else if (header.includes("product")) obj.products = values[index];
        else if (header.includes("service")) obj.services = values[index];
      });

      // Fallback: If company_name is missing or empty, use owner_name as company_name
      if (!obj.company_name && obj.owner_name) {
        obj.company_name = obj.owner_name;
      }

      return obj;
    });
  };

  const handleBulkImport = async () => {
    if (!bulkData.trim()) return;
    setImporting(true);
    try {
      const parsed = parseBulkData(bulkData);
      if (parsed.length === 0) {
        toast.error("Invalid format. Please include headers.");
        return;
      }

      const validRows = parsed.filter(row => row.company_name && row.phone);
      if (validRows.length === 0) {
        toast.error("No valid rows found (Company and Phone required)");
        return;
      }

      toast.info(`Importing ${validRows.length} entries...`);

      let fbSuccess = 0;
      let compSuccess = 0;

      for (const row of validRows) {
        // Check for FB duplicate
        const { data: existingFB } = await (supabase
          .from("facebook_data" as any)
          .select("id")
          .eq("company_name", row.company_name)
          .eq("phone", row.phone) as any);

        if (!existingFB || existingFB.length === 0) {
          const { error: fbErr } = await (supabase.from("facebook_data" as any).insert([row]) as any);
          if (!fbErr) fbSuccess++;
        }
      }

      toast.success(`Imported ${fbSuccess} to Facebook.`);
      setAddDialogOpen(false);
      setBulkData("");
      fetchFacebookData();
    } catch (error: any) {
      toast.error(error.message || "Bulk import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setBulkData(event.target?.result as string);
    reader.readAsText(file);
  };
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Share2 className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold text-white">Facebook Data</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <FacebookDataCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Share2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">Facebook Data</h2>
            <p className="text-muted-foreground text-white/70">Manage and sync Facebook leads</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {userRole === "admin" && (
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                  <Plus className="h-4 w-4" /> Add & Sync Data
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl bg-[#1e293b] border-white/10 text-white">
                <DialogHeader>
                  <DialogTitle>Add Facebook Data (Syncs to All Companies)</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Add new leads manually or in bulk. They will appear in both Facebook and Company lists.
                  </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="single" className="mt-4">
                  <TabsList className="grid w-full grid-cols-2 mb-6 bg-[#0f172a] p-1">
                    <TabsTrigger value="single">Single Entry</TabsTrigger>
                    <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
                  </TabsList>

                  <TabsContent value="single" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Company Name *</Label>
                        <Input
                          value={newFacebookData.company_name}
                          onChange={e => setNewFacebookData({ ...newFacebookData, company_name: e.target.value })}
                          className="bg-[#0f172a] border-white/10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Owner Name</Label>
                        <Input
                          value={newFacebookData.owner_name}
                          onChange={e => setNewFacebookData({ ...newFacebookData, owner_name: e.target.value })}
                          className="bg-[#0f172a] border-white/10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone *</Label>
                        <Input
                          value={newFacebookData.phone}
                          onChange={e => setNewFacebookData({ ...newFacebookData, phone: e.target.value })}
                          className="bg-[#0f172a] border-white/10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          value={newFacebookData.email}
                          onChange={e => setNewFacebookData({ ...newFacebookData, email: e.target.value })}
                          className="bg-[#0f172a] border-white/10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Products</Label>
                        <Input
                          value={newFacebookData.products}
                          onChange={e => setNewFacebookData({ ...newFacebookData, products: e.target.value })}
                          className="bg-[#0f172a] border-white/10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Services</Label>
                        <Input
                          value={newFacebookData.services}
                          onChange={e => setNewFacebookData({ ...newFacebookData, services: e.target.value })}
                          className="bg-[#0f172a] border-white/10"
                        />
                      </div>
                    </div>
                    <Button onClick={handleAddSingle} className="w-full bg-blue-600" disabled={addingSingle}>
                      {addingSingle ? <Loader2 className="animate-spin" /> : "Add to Both Lists"}
                    </Button>
                  </TabsContent>

                  <TabsContent value="bulk" className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload CSV</Label>
                      <Input type="file" onChange={handleFileUpload} className="bg-[#0f172a] border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2"><ClipboardPaste className="h-4 w-4" /> Paste Data</Label>
                      <Textarea
                        placeholder="Paste from Excel (Headers: Company, Phone, Owner, etc.)"
                        value={bulkData}
                        onChange={e => setBulkData(e.target.value)}
                        className="bg-[#0f172a] border-white/10 min-h-[200px]"
                      />
                    </div>
                    <Button onClick={handleBulkImport} className="w-full bg-green-600" disabled={importing}>
                      {importing ? <Loader2 className="animate-spin" /> : <><ListPlus className="mr-2 h-4 w-4" /> Sync Bulk Data</>}
                    </Button>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          )}
          <Button
            onClick={fetchFacebookData}
            variant="outline"
            size="sm"
            disabled={loading}
            className="flex items-center gap-2 text-white"
          >
            <RefreshCw className={`h-4 w-4 text-white ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive">Error Loading Data</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchFacebookData}
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Retry
              </Button>
            </div>
            {(error.includes("facebook_data_shares") || error.includes("PGRST205")) && (
              <div className="mt-2 p-4 bg-muted rounded-lg space-y-3 border-2 border-orange-500/50">
                <div>
                  <p className="text-sm font-semibold mb-1 text-orange-700 dark:text-orange-400">📋 Missing Table: facebook_data_shares</p>
                  <p className="text-xs text-muted-foreground">
                    The facebook_data_shares table is required for sharing Facebook data with employees. Please run the migration to create it.
                  </p>
                </div>
                
                <div className="space-y-2 text-xs">
                  <div className="p-2 bg-background rounded border">
                    <p className="font-semibold mb-1">📋 Copy & Paste This SQL:</p>
                    <p className="text-[10px] text-muted-foreground mb-1">Go to: Supabase Dashboard → SQL Editor → Paste and Run:</p>
                    <code 
                      className="block bg-slate-900 text-green-400 px-3 py-2 rounded text-[11px] font-mono whitespace-pre-wrap break-all cursor-pointer hover:bg-slate-800 transition-colors"
                      onClick={(e) => {
                        navigator.clipboard.writeText(`-- Create facebook_data_shares table
CREATE TABLE IF NOT EXISTS public.facebook_data_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  shared_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.data_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(facebook_data_id, employee_id)
);

ALTER TABLE public.facebook_data_shares ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_facebook_data_shares_employee_id ON public.facebook_data_shares(employee_id);
CREATE INDEX idx_facebook_data_shares_facebook_data_id ON public.facebook_data_shares(facebook_data_id);
CREATE INDEX idx_facebook_data_shares_request_id ON public.facebook_data_shares(request_id);

CREATE POLICY "Employees can view their own shared facebook data"
  ON public.facebook_data_shares FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can share facebook data"
  ON public.facebook_data_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') AND
    shared_by_id = auth.uid()
  );

CREATE POLICY "Admins can delete facebook data shares"
  ON public.facebook_data_shares FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );`);
                        toast.success("SQL copied to clipboard! Paste it in Supabase SQL Editor.");
                      }}
                      title="Click to copy"
                    >
{`-- Create facebook_data_shares table
CREATE TABLE IF NOT EXISTS public.facebook_data_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_data_id BIGINT NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  shared_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.data_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(facebook_data_id, employee_id)
);

-- Enable RLS and create policies (see migration file for full SQL)`}
                    </code>
                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                      Click the code above to copy, then paste in Supabase SQL Editor
                    </p>
                  </div>
                </div>
          </div>
        )}
            {(error.includes("RLS") || error.includes("permission") || error.includes("42501") || error.includes("No data returned")) && !error.includes("facebook_data_shares") && (
              <div className="mt-2 p-4 bg-muted rounded-lg space-y-3 border-2 border-yellow-500/50">
                <div>
                  <p className="text-sm font-semibold mb-1 text-yellow-700 dark:text-yellow-400">🔒 RLS Policy Issue Detected</p>
                  <p className="text-xs text-muted-foreground">
                    The facebook_data table has Row Level Security (RLS) enabled but policies are blocking access to your data.
                  </p>
                </div>
                
                <div className="space-y-2 text-xs">
                  <div className="p-2 bg-background rounded border">
                    <p className="font-semibold mb-1">📋 Copy & Paste This SQL (Easiest Fix):</p>
                    <p className="text-[10px] text-muted-foreground mb-1">Go to: Supabase Dashboard → SQL Editor → Paste and Run:</p>
                    <code 
                      className="block bg-slate-900 text-green-400 px-3 py-2 rounded text-[11px] font-mono whitespace-pre-wrap break-all cursor-pointer hover:bg-slate-800 transition-colors"
                      onClick={(e) => {
                        navigator.clipboard.writeText(`-- Fix Facebook Data RLS Access
ALTER TABLE public.facebook_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view facebook data" ON public.facebook_data;

CREATE POLICY "Allow authenticated users to view facebook data"
  ON public.facebook_data 
  FOR SELECT
  TO authenticated
  USING (true);`);
                        toast.success("SQL copied to clipboard! Paste it in Supabase SQL Editor.");
                      }}
                      title="Click to copy"
                    >
{`-- Fix Facebook Data RLS Access
ALTER TABLE public.facebook_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view facebook data" ON public.facebook_data;

CREATE POLICY "Allow authenticated users to view facebook data"
  ON public.facebook_data 
  FOR SELECT
  TO authenticated
  USING (true);`}
                    </code>
                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                      Click the code above to copy, then paste in Supabase SQL Editor
                    </p>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <p className="font-semibold mb-1">📁 Alternative: Run Migration File</p>
                    <p className="text-[10px] text-muted-foreground">
                      Or use the migration file: <code className="bg-background px-1 rounded">fix_facebook_data_rls.sql</code>
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded">
                  <span className="text-blue-500">💡</span>
                  <p className="text-[10px] text-blue-700 dark:text-blue-300">
                    After running the SQL, refresh this page (or click Retry) and your 11+ Facebook data entries should appear.
                  </p>
                </div>
      </div>
            )}
          </CardContent>
        </Card>
      )} */}

      {!error && facebookData.length === 0 && !loading ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Facebook data</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {userRole === "admin"
                ? "There is no Facebook data in the database at the moment."
                : "You don't have any shared Facebook data yet. Request Facebook data from the 'Request Data' section, and once approved by admin, the shared data will appear here."}
            </p>
          </CardContent>
        </Card>
      ) : !error && facebookData.length > 0 ? (
        <div className="space-y-4">
          {/* Card Grid View */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6 items-stretch">
            {facebookData.map((data) => (
              <FacebookDataCard
                key={data.id}
                data={data}
                onUpdate={fetchFacebookData}
                userRole={userRole}
                // Even admins now use the Request Edit workflow for a bigger form and tracking
                onDelete={() => handleDelete(data)}
                onRequestEdit={!approvedEditRequests.has(data.id) ? () => handleRequestEditClick(data) : undefined}
                approvedForEdit={approvedEditRequests.has(data.id)}
              />
            ))}
          </div>

          {/* Table View for Admin */}
          {userRole === "admin" && (
            <Card>
              <CardHeader>
                <CardTitle>All Facebook Data (Table View)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {facebookData.map((data) => (
                        <TableRow key={data.id}>
                          <TableCell className="font-mono font-semibold">{data.id}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              {data.name || "N/A"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {data.email ? (
                              <a
                                href={`mailto:${data.email}`}
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <Mail className="h-3 w-3" />
                                {data.email}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span className="text-xs">
                                  <span className="font-semibold">Uploaded:</span>{" "}
                                  {data.created_at
                                    ? new Date(data.created_at).toLocaleString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                    : "N/A"}
                                </span>
                              </div>
                              {userRole === "admin" && data.shared_at && (
                                <div className="flex items-center gap-1 text-primary">
                                  <Share2 className="h-3 w-3" />
                                  <span className="text-xs">
                                    <span className="font-semibold">Shared:</span>{" "}
                                    {new Date(data.shared_at).toLocaleString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {approvedEditRequests.has(data.id) ? (
                                <Badge variant="outline" className="h-8 w-8 rounded-full p-0 flex items-center justify-center bg-green-100 border-green-200">
                                  <CheckSquare className="h-4 w-4 text-green-600" />
                                </Badge>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRequestEditClick(data)}
                                  className="text-primary hover:text-primary"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(data)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {/* No direct edit dialog needed as admins also use requests now */}

      {/* Employee Edit Request Dialog */}
      <Dialog open={editRequestDialogOpen} onOpenChange={setEditRequestDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Submit Facebook Data</DialogTitle>
            <DialogDescription className="text-white/80">
              Please fill in all required fields. Services is optional.
            </DialogDescription>
          </DialogHeader>
          {requestingEditData && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-request-company-name" className="text-white">
                  Company Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-request-company-name"
                  placeholder="Enter company name"
                  value={editRequestFormData.company_name}
                  onChange={(e) => setEditRequestFormData({ ...editRequestFormData, company_name: e.target.value })}
                  required
                  className="text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-request-owner-name" className="text-white">
                  Owner Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-request-owner-name"
                  placeholder="Enter owner name"
                  value={editRequestFormData.owner_name}
                  onChange={(e) => setEditRequestFormData({ ...editRequestFormData, owner_name: e.target.value })}
                  required
                  className="text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-request-phone" className="text-white">
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-request-phone"
                  type="tel"
                  placeholder="Enter phone number"
                  value={editRequestFormData.phone}
                  onChange={(e) => setEditRequestFormData({ ...editRequestFormData, phone: e.target.value })}
                  required
                  className="text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-request-email" className="text-white">
                  Email Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-request-email"
                  type="email"
                  placeholder="Enter email address"
                  value={editRequestFormData.email}
                  onChange={(e) => setEditRequestFormData({ ...editRequestFormData, email: e.target.value })}
                  required
                  className="text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-request-products" className="text-white">
                  Products <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="edit-request-products"
                  placeholder="Enter products"
                  value={editRequestFormData.products}
                  onChange={(e) => setEditRequestFormData({ ...editRequestFormData, products: e.target.value })}
                  rows={3}
                  required
                  className="text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-request-services" className="text-white">
                  Services <span className="text-muted-foreground">(Optional)</span>
                </Label>
                <Textarea
                  id="edit-request-services"
                  placeholder="Enter services (optional)"
                  value={editRequestFormData.services}
                  onChange={(e) => setEditRequestFormData({ ...editRequestFormData, services: e.target.value })}
                  rows={3}
                  className="text-white placeholder:text-white/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-request-message" className="text-white">
                  Additional Notes (Optional)
                </Label>
                <Textarea
                  id="edit-request-message"
                  placeholder="Any additional information..."
                  value={editRequestMessage}
                  onChange={(e) => setEditRequestMessage(e.target.value)}
                  rows={3}
                  className="text-white placeholder:text-white/50"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditRequestDialogOpen(false);
                setRequestingEditData(null);
                setEditRequestMessage("");
                setEditRequestFormData({
                  company_name: "",
                  owner_name: "",
                  phone: "",
                  email: "",
                  products: "",
                  services: ""
                });
              }}
              disabled={submittingRequest}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitEditRequest}
              disabled={submittingRequest ||
                !editRequestFormData.company_name.trim() ||
                !editRequestFormData.owner_name.trim() ||
                !editRequestFormData.phone.trim() ||
                !editRequestFormData.email.trim() ||
                !editRequestFormData.products.trim()}
              className="bg-primary text-white hover:bg-primary hover:text-white"
            >
              {submittingRequest ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                  <span className="text-white">Submitting...</span>
                </>
              ) : (
                <span className="text-white">Submit Request</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default FacebookDataView;
