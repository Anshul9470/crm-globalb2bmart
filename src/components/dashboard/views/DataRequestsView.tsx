import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Loader2, Share2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

const DataRequestsView = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [availableFacebookData, setAvailableFacebookData] = useState<any[]>([]);
  const [selectedDataIds, setSelectedDataIds] = useState<number[]>([]);
  const [sharing, setSharing] = useState(false);
  const [loadingFacebookData, setLoadingFacebookData] = useState(false);
  const [totalFacebookDataCount, setTotalFacebookDataCount] = useState(0);
  const [alreadySharedCount, setAlreadySharedCount] = useState(0);
  const [alreadySharedIds, setAlreadySharedIds] = useState<Set<number>>(new Set());
  const [sharedDataMap, setSharedDataMap] = useState<Map<number, any>>(new Map());


  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("data_requests")
      .select(`
        *,
        requested_by:profiles!requested_by_id(display_name, email)
      `)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRequests(data);
    }
    setLoading(false);
  };

  const isFacebookRequest = (request: any) => {
    return request.message?.includes("[Facebook Data Request]");
  };

  const fetchAvailableFacebookData = async (request?: any) => {
    const requestToUse = request || selectedRequest;

    if (!requestToUse) {
      console.warn("⚠️ No selected request, cannot fetch Facebook data");
      return;
    }

    setLoadingFacebookData(true);
    try {
      console.log("🔍 Fetching all Facebook data for sharing...", { requestId: requestToUse.id });

      // Get all Facebook data
      const { data: allData, error: dataError } = await (supabase
        .from("facebook_data" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any);

      if (dataError) {
        console.error("❌ Error fetching Facebook data:", dataError);
        throw dataError;
      }

      console.log("✅ Fetched Facebook data:", {
        count: allData?.length || 0,
        data: allData
      });

      // Get already shared data for ANY employee (to show what's already been shared)
      // First fetch shares without join to avoid foreign key issues
      const { data: sharesData, error: sharesError } = await (supabase
        .from("facebook_data_shares" as any)
        .select("facebook_data_id, employee_id, shared_by_id, created_at")
        .order("created_at", { ascending: false }) as any);

      // Get IDs of already shared data (shared with ANY employee, not just this one)
      let sharedIds = new Set<number>();
      let sharedDataMap = new Map<number, any>(); // Map of facebook_data_id -> share info

      if (sharesError) {
        if (sharesError.code === "PGRST205") {
          // Table doesn't exist - no shares yet
          console.log("📋 facebook_data_shares table doesn't exist yet - no data has been shared");
          sharedIds = new Set<number>();
        } else {
          console.warn("⚠️ Could not check already shared data:", sharesError);
          // Continue anyway - assume no shares if we can't check
          sharedIds = new Set<number>();
        }
      } else if (sharesData && sharesData.length > 0) {
        // Fetch profiles separately to get employee names
        const sharedByIds = [...new Set(sharesData.map((s: any) => s.shared_by_id).filter(Boolean))];
        const employeeIds = [...new Set(sharesData.map((s: any) => s.employee_id).filter(Boolean))];
        const allProfileIds = [...new Set([...sharedByIds, ...employeeIds])];

        let profilesMap = new Map();
        if (allProfileIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", allProfileIds);

          if (profiles) {
            profiles.forEach((profile: any) => {
              profilesMap.set(profile.id, profile);
            });
          }
        }

        // Get all unique facebook_data_ids that have been shared with ANY employee
        const uniqueSharedIds = new Set<number>();
        sharesData.forEach((share: any) => {
          const fbId = Number(share.facebook_data_id);
          uniqueSharedIds.add(fbId);
          // Store the first share info for each facebook_data_id (most recent)
          if (!sharedDataMap.has(fbId)) {
            sharedDataMap.set(fbId, {
              ...share,
              shared_by: share.shared_by_id ? profilesMap.get(share.shared_by_id) : null,
              employee: share.employee_id ? profilesMap.get(share.employee_id) : null
            });
          }
        });
        sharedIds = uniqueSharedIds;

        console.log("📋 Already shared data:", {
          totalShares: sharesData.length,
          uniqueFacebookDataIds: sharedIds.size,
          sharedIds: Array.from(sharedIds),
          sharedDataMap: Object.fromEntries(sharedDataMap)
        });
      }

      // Show ALL Facebook data (not filtered)
      const allFacebookData = allData || [];
      const totalCount = allFacebookData.length;
      const sharedCount = sharedIds.size;
      const availableCount = totalCount - sharedCount;

      console.log("📋 Facebook data for sharing:", {
        total: totalCount,
        alreadyShared: sharedCount,
        available: availableCount,
        showingAll: true,
        sharedIds: Array.from(sharedIds),
        allDataCount: allFacebookData.length
      });

      // Always set data even if empty
      setTotalFacebookDataCount(totalCount);
      setAlreadySharedCount(sharedCount);
      setAlreadySharedIds(sharedIds);
      setSharedDataMap(sharedDataMap);
      // Show ALL data, not filtered
      setAvailableFacebookData(allFacebookData);

      console.log("✅ Setting availableFacebookData:", {
        length: allFacebookData.length,
        data: allFacebookData,
        firstItem: allFacebookData[0]
      });

      if (allFacebookData.length === 0) {
        toast.warning("No Facebook data found in the database.");
      }

      // Clear selected data when dialog opens
      setSelectedDataIds([]);
    } catch (error: any) {
      console.error("❌ Error fetching Facebook data:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });

      // Show error but don't clear existing data if any
      if (availableFacebookData.length === 0) {
        setAvailableFacebookData([]);
        setTotalFacebookDataCount(0);
      }

      toast.error(error.message || "Failed to load Facebook data. Please check console for details.");
    } finally {
      setLoadingFacebookData(false);
      console.log("🏁 Finished loading Facebook data");
    }
  };
  const handleApprove = async (request: any) => {
    if (isFacebookRequest(request)) {
      // Check if request is already approved
      if (request.status === "approved") {
        toast.info("This request has already been approved and Facebook data has been shared.");
        return;
      }

      // Set selected request first
      setSelectedRequest(request);
      setSelectedDataIds([]);
      setAvailableFacebookData([]);
      setTotalFacebookDataCount(0);
      setAlreadySharedCount(0);
      setAlreadySharedIds(new Set());
      setSharedDataMap(new Map());
      setLoadingFacebookData(true);

      // Open dialog first so it can show loading state
      setShareDialogOpen(true);

      // Fetch data immediately
      try {
        await fetchAvailableFacebookData(request);
      } catch (error: any) {
        console.error("Error in fetchAvailableFacebookData:", error);
        toast.error(error.message || "Failed to load Facebook data");
        setLoadingFacebookData(false);
      }
    } else {
      // General data request: auto-assign based on 24hr history
      // First request in 24 hours → 25 companies
      // Second request in 24 hours → 10 companies
      try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count, error } = await supabase
          .from("data_requests")
          .select("*", { count: 'exact', head: true })
          .eq("requested_by_id", request.requested_by_id)
          .eq("status", "approved")
          .gte("created_at", since24h);

        const approvedInLast24h = (!error && count) ? count : 0;
        // 0 approved in last 24h = this is their first → assign 25
        // 1+ approved in last 24h = second or more request → assign 10
        const autoBatchSize = approvedInLast24h === 0 ? 25 : 10;

        toast.info(`Auto-assigning ${autoBatchSize} companies (${approvedInLast24h === 0 ? '1st request today' : '2nd+ request today'})...`);
        await approveGeneralRequestAndAssign(request, autoBatchSize);
      } catch (err) {
        // Fallback: assign 25 if we can't check history
        toast.info("Auto-assigning 25 companies...");
        await approveGeneralRequestAndAssign(request, 25);
      }
    }
  };

  const handleShareFacebookData = async () => {
    if (!selectedRequest || selectedDataIds.length === 0) {
      toast.error("Please select at least one Facebook data entry to share");
      return;
    }

    setSharing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // First, approve the request
      const { error: approveError } = await supabase
        .from("data_requests")
        .update({ status: "approved" })
        .eq("id", selectedRequest.id);

      if (approveError) throw approveError;

      // Filter out already-shared data from selected IDs to avoid duplicates
      const newShareIds = selectedDataIds.filter((id) => !alreadySharedIds.has(id));

      if (newShareIds.length === 0) {
        toast.warning("All selected data has already been shared with this employee.");
        return;
      }

      // Create shares for selected Facebook data (only new ones)
      const shares = newShareIds.map((facebookDataId) => ({
        facebook_data_id: facebookDataId,
        employee_id: selectedRequest.requested_by_id,
        shared_by_id: user.id,
      }));

      console.log("📤 Sharing Facebook data:", {
        sharesCount: shares.length,
        employeeId: selectedRequest.requested_by_id,
        facebookDataIds: newShareIds,
        totalSelected: selectedDataIds.length,
        alreadyShared: selectedDataIds.length - newShareIds.length,
        shares: shares
      });

      const { data: insertedShares, error: shareError } = await (supabase
        .from("facebook_data_shares" as any)
        .insert(shares)
        .select() as any);

      if (shareError) {
        // Check if error is due to duplicate shares (already shared)
        if (shareError.code === "23505") {
          // Unique violation - data already shared with this employee
          console.warn("⚠️ Some data was already shared with this employee");
          toast.warning("Some selected data was already shared with this employee. Only new data entries were shared.");

          // Filter out already-shared data and try to insert only new ones
          const alreadySharedIds = new Set();
          if (shareError.details) {
            try {
              // Try to extract which IDs were duplicates from error message
              const errorMessage = shareError.message || "";
              // Note: Supabase may not provide exact duplicate IDs in error
              // So we'll just warn and continue
            } catch (e) {
              console.error("Error parsing duplicate IDs:", e);
            }
          }
        } else {
          // Other errors
          console.error("❌ Error sharing data:", shareError);
          console.error("Share error details:", {
            code: shareError.code,
            message: shareError.message,
            details: shareError.details,
            hint: shareError.hint
          });
          toast.error(`Failed to share data: ${shareError.message || shareError.code}`);
        }
      } else {
        console.log("✅ Successfully created shares:", insertedShares);
        const sharedCount = insertedShares?.length || newShareIds.length;
        const skippedCount = selectedDataIds.length - newShareIds.length;

        if (skippedCount > 0) {
          toast.success(
            `Request approved and ${sharedCount} Facebook data ${sharedCount === 1 ? 'entry' : 'entries'} shared successfully! ${skippedCount} ${skippedCount === 1 ? 'entry was' : 'entries were'} already shared.`
          );
        } else {
          toast.success(
            `Request approved and ${sharedCount} Facebook data ${sharedCount === 1 ? 'entry' : 'entries'} shared successfully!`
          );
        }

        // Dispatch event to notify dashboards to refresh
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("facebookDataUpdated"));
        }
      }

      setShareDialogOpen(false);
      setSelectedRequest(null);
      setSelectedDataIds([]);
      setAvailableFacebookData([]);
      setTotalFacebookDataCount(0);
      setAlreadySharedCount(0);
      setAlreadySharedIds(new Set());
      setSharedDataMap(new Map());
      fetchRequests();
    } catch (error: any) {
      console.error("Error sharing Facebook data:", error);
      toast.error(error.message || "Failed to approve and share data");
    } finally {
      setSharing(false);
    }
  };

  const handleUpdateStatus = async (requestId: string, status: "approved" | "rejected" | "pending") => {
    try {
      const { error } = await supabase
        .from("data_requests")
        .update({ status })
        .eq("id", requestId);

      if (error) throw error;

      toast.success(`Request ${status}`);
      fetchRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to update request");
    }
  };

  // Approve a general (non-Facebook) data request and automatically assign
  // the specified number of unassigned companies to the requesting employee.
  const approveGeneralRequestAndAssign = async (request: any, customBatchSize?: number) => {
    const finalBatchSize = customBatchSize || batchSize;
    try {
      // 1) Approve the request
      const { error: updateError } = await supabase
        .from("data_requests")
        .update({ status: "approved" })
        .eq("id", request.id);

      if (updateError) throw updateError;

      // 2) Fetch the first batch of unassigned companies (oldest first)
      // Also check that assigned_at is null to avoid companies with stale timestamps
      const { data: unassignedCompanies, error: companiesError } = await supabase
        .from("companies")
        .select("id")
        .is("assigned_to_id", null)
        .is("assigned_at", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(Math.max(finalBatchSize * 10, 500)); // Large pool = always enough fresh unique data

      if (companiesError) throw companiesError;

      // 2.5) Filter out companies that this employee has previously worked on
      // Check if employee has any comments on these companies
      if (!unassignedCompanies || unassignedCompanies.length === 0) {
        const companiesToAssign: any[] = [];
        toast.warning("Request approved but no companies available to assign.");
        fetchRequests();
        return;
      }

      const unassignedCompanyIds = unassignedCompanies.map((c: any) => c.id);

      // CRITICAL: Ensure each person gets UNIQUE data that has NEVER been worked on by ANYONE.
      // Fetch ANY comments for these companies (not just for the current employee).
      const { data: allComments, error: commentsError } = await supabase
        .from("comments")
        .select("company_id")
        .in("company_id", unassignedCompanyIds);

      if (commentsError) {
        console.error("Error fetching comment history:", commentsError);
        // Continue on error, but uniqueness might be compromised if comment fetch fails
      }

      // Create a Set of company IDs that have ANY comments from ANYONE
      const previouslyWorkedCompanyIds = new Set(
        (allComments || []).map((comment: any) => comment.company_id)
      );

      // Filter out companies that have ANY previous activity
      const freshCompaniesToAssign = unassignedCompanies.filter((company: any) =>
        !previouslyWorkedCompanyIds.has(company.id)
      );

      console.log("🔍 Enforcing unique data assignment:", {
        employeeId: request.requested_by_id,
        employeeName: request.requested_by?.display_name,
        totalUnassignedFetched: unassignedCompanies.length,
        companiesWithPreviousActivity: previouslyWorkedCompanyIds.size,
        availableFreshCompanies: freshCompaniesToAssign.length,
        willAssign: Math.min(freshCompaniesToAssign.length, finalBatchSize)
      });

      // Limit to batch size
      const companiesToAssign = freshCompaniesToAssign.slice(0, finalBatchSize);
      const nowIso = new Date().toISOString();

      // Check if we have companies to assign
      if (companiesToAssign.length === 0) {
        toast.warning("Request approved but no fresh companies were available to assign.");
        fetchRequests();
        return;
      }

      const companyIds = companiesToAssign.map((c: any) => c.id);

      console.log("📋 Assigning companies:", {
        newAssignments: companiesToAssign.length,
        employeeId: request.requested_by_id,
        employeeName: request.requested_by?.display_name,
        assignedAt: nowIso,
        companyIds: companyIds.slice(0, 5) // Log first 5 IDs
      });

      // 3) Assign new companies ONLY (no refreshing old assignments)
      // This ensures employee gets exactly the requested batch size of companies
      const { data: updatedCompanies, error: assignError } = await supabase
        .from("companies")
        .update({
          assigned_to_id: request.requested_by_id,
          assigned_at: nowIso,
          approval_status: "approved"
        })
        .in("id", companyIds)
        .select("id, assigned_at, assigned_to_id");

      if (assignError) {
        console.error("❌ Error assigning companies:", assignError);
        throw assignError;
      }

      console.log("✅ Companies assigned successfully:", {
        count: updatedCompanies?.length || 0,
        expected: companiesToAssign.length,
        sample: updatedCompanies?.[0],
        allAssignedAt: updatedCompanies?.map((c: any) => c.assigned_at)
      });

      // Verify that all companies were updated with fresh timestamps
      const nowTime = Date.now();
      const staleCompanies = updatedCompanies?.filter((c: any) => {
        if (!c.assigned_at) return true;
        const assignedTime = new Date(c.assigned_at).getTime();
        const diffMinutes = (nowTime - assignedTime) / (1000 * 60);
        return diffMinutes > 1; // More than 1 minute old
      });

      if (staleCompanies && staleCompanies.length > 0) {
        console.warn("⚠️ Some companies have stale assigned_at timestamps:", staleCompanies);
      }

      const assignedCount = updatedCompanies?.length || 0;
      const successMessage = `Request approved! ${assignedCount} fresh compan${assignedCount === 1 ? "y" : "ies"} assigned to ${request.requested_by?.display_name || "employee"
        }.`;

      toast.success(successMessage);

      // 4) Notify dashboards to refresh company-related counts
      // Add a delay to ensure database update is fully committed and visible
      // Dispatch multiple times to ensure it's caught even if the employee dashboard is in a different tab
      setTimeout(() => {
        if (typeof window !== "undefined") {
          console.log("📢 Dispatching companyDataUpdated event for employee:", request.requested_by_id);
          window.dispatchEvent(new Event("companyDataUpdated"));
          // Dispatch again after a short delay to ensure it's caught
          setTimeout(() => {
            window.dispatchEvent(new Event("companyDataUpdated"));
          }, 1000);
        }
      }, 1000);

      // 5) Refresh the requests list
      fetchRequests();
    } catch (error: any) {
      console.error("Error approving general data request:", error);
      toast.error(error.message || "Failed to approve request and assign data");
    }
  };

  const toggleDataSelection = (id: number) => {
    // Don't allow selecting already-shared data
    if (alreadySharedIds.has(id)) {
      return;
    }

    setSelectedDataIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    // Only select data that hasn't been shared yet
    const selectableIds = availableFacebookData
      .filter((item: any) => !alreadySharedIds.has(item.id))
      .map((item: any) => item.id);
    setSelectedDataIds(selectableIds);
  };

  const deselectAll = () => {
    setSelectedDataIds([]);
  };

  const selectTopX = (amount: number) => {
    const selectableItems = availableFacebookData.filter((item: any) => !alreadySharedIds.has(item.id));
    const topIds = selectableItems.slice(0, amount).map((item: any) => item.id);
    setSelectedDataIds(topIds);
    toast.info(`Selected top ${topIds.length} available items`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold mb-6 text-white">Data Requests</h2>

        <div className="space-y-4">
          {requests.length === 0 ? (
            <p className="text-muted-foreground">No data requests.</p>
          ) : (
            requests.map((request) => {
              const isFBRequest = isFacebookRequest(request);

              return (
                <Card key={request.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {request.requested_by.display_name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {request.requested_by.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isFBRequest && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Share2 className="h-3 w-3" />
                            Facebook
                          </Badge>
                        )}
                        <Badge
                          variant={
                            request.status === "approved"
                              ? "default"
                              : request.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {request.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4">{request.message}</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Requested on {new Date(request.created_at).toLocaleString()}
                    </p>
                    {request.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(request)}
                        >
                          {isFBRequest ? (
                            <>
                              <Share2 className="mr-2 h-4 w-4" />
                              Approve & Share
                            </>
                          ) : (
                            "Approve"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleUpdateStatus(request.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                    {request.status === "approved" && isFBRequest && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✓ Facebook data has been shared with this employee
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Share Facebook Data Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="text-2xl flex items-center gap-2 text-white">
              <Share2 className="h-5 w-5 text-primary" />
              Share Facebook Data
            </DialogTitle>
            <DialogDescription className="text-base pt-1 text-white/90">
              Select Facebook data entries to share with{" "}
              <span className="font-semibold text-white">
                {selectedRequest?.requested_by?.display_name || selectedRequest?.requested_by?.email || "employee"}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pt-4 pb-4 space-y-4 flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-sm font-semibold text-white bg-white/20">
                  {selectedDataIds.length} of {Math.max(0, availableFacebookData.length - alreadySharedCount)} available selected
                </Badge>
                {totalFacebookDataCount > 0 && (
                  <Badge variant="outline" className="text-sm font-semibold text-white border-white/30">
                    Total: {totalFacebookDataCount}
                  </Badge>
                )}
                {alreadySharedCount > 0 && (
                  <Badge variant="outline" className="text-sm font-semibold text-white border-white/30">
                    {alreadySharedCount} already shared
                  </Badge>
                )}
                {selectedDataIds.length > 0 && (
                  <span className="text-xs text-white/80">
                    Ready to share
                  </span>
                )}
              </div>
              <div className="flex gap-2 text-white items-center">
                <div className="flex items-center bg-white/10 rounded-md overflow-hidden border border-white/20">
                  <input
                    type="number"
                    min="1"
                    className="w-16 bg-transparent px-2 py-1 text-sm outline-none border-r border-white/20"
                    placeholder="Amt"
                    defaultValue={25}
                    id="fb-select-amount"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 hover:bg-white/10 rounded-none border-none"
                    onClick={() => {
                      const input = document.getElementById('fb-select-amount') as HTMLInputElement;
                      const val = parseInt(input?.value) || 25;
                      selectTopX(val);
                    }}
                  >
                    Select Top
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  disabled={availableFacebookData.length === 0 || (availableFacebookData.length - alreadySharedCount) === 0}
                >
                  All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deselectAll}
                  disabled={selectedDataIds.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
              {loadingFacebookData ? (
                <div className="flex flex-col items-center justify-center py-16 h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-white">Loading Facebook data...</p>
                </div>
              ) : (
                <div className="border rounded-lg" style={{ height: '500px', maxHeight: '60vh' }}>
                  <ScrollArea className="h-full w-full">
                    <div className="p-4 space-y-2">
                      {availableFacebookData && availableFacebookData.length > 0 ? (
                        <>
                          {/* Available Items (Not Already Shared) */}
                          {availableFacebookData
                            .filter((item: any) => !alreadySharedIds.has(item.id))
                            .map((item: any) => {
                              const isSelected = selectedDataIds.includes(item.id);
                              return (
                                <div
                                  key={item.id}
                                  className={`flex items-center gap-4 p-4 border-2 rounded-lg transition-all ${isSelected
                                    ? "bg-primary/5 border-primary shadow-sm cursor-pointer"
                                    : "hover:bg-muted/50 border-border hover:border-primary/50 cursor-pointer"
                                    }`}
                                  onClick={() => toggleDataSelection(item.id)}
                                >
                                  <div className="flex-shrink-0">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleDataSelection(item.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-base mb-1 truncate text-white">
                                          {item.company_name || item.name || "Unknown"}
                                        </p>
                                        <div className="flex items-center gap-4 text-sm">
                                          {item.email && (
                                            <p className="text-white/80 truncate">
                                              {item.email}
                                            </p>
                                          )}
                                          {item.phone && (
                                            <p className="text-white/80 truncate">
                                              {item.phone}
                                            </p>
                                          )}
                                          {item.created_at && (
                                            <p className="text-xs text-white/70 whitespace-nowrap">
                                              {new Date(item.created_at).toLocaleDateString()}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <Badge variant="outline" className="text-xs font-mono text-white border-white/30">
                                          ID: {item.id}
                                        </Badge>
                                        {isSelected && (
                                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground">
                                            <Check className="h-4 w-4" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                          {/* Already Shared Items Section */}
                          {availableFacebookData.some((item: any) => alreadySharedIds.has(item.id)) && (
                            <>
                              <div className="pt-4 pb-2 border-t border-border/50">
                                <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">
                                  Already Shared ({availableFacebookData.filter((item: any) => alreadySharedIds.has(item.id)).length})
                                </h3>
                              </div>
                              {availableFacebookData
                                .filter((item: any) => alreadySharedIds.has(item.id))
                                .map((item: any) => {
                                  const shareInfo = sharedDataMap.get(item.id);
                                  const sharedWithEmployee = shareInfo?.shared_by?.display_name || shareInfo?.shared_by?.email || "an employee";
                                  return (
                                    <div
                                      key={item.id}
                                      className="flex items-center gap-4 p-4 border-2 rounded-lg bg-muted/30 border-muted opacity-60 cursor-not-allowed"
                                    >
                                      <div className="flex-shrink-0">
                                        <Checkbox
                                          checked={false}
                                          disabled={true}
                                        />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-base mb-1 truncate text-white">
                                              {item.company_name || item.name || "Unknown"}
                                            </p>
                                            <div className="flex items-center gap-4 text-sm">
                                              {item.email && (
                                                <p className="text-white/80 truncate">
                                                  {item.email}
                                                </p>
                                              )}
                                              {item.phone && (
                                                <p className="text-white/80 truncate">
                                                  {item.phone}
                                                </p>
                                              )}
                                              {item.created_at && (
                                                <p className="text-xs text-white/70 whitespace-nowrap">
                                                  {new Date(item.created_at).toLocaleDateString()}
                                                </p>
                                              )}
                                            </div>
                                            {shareInfo && (
                                              <p className="text-xs text-yellow-400 mt-1">
                                                Already shared with: {sharedWithEmployee}
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <Badge variant="outline" className="text-xs font-mono text-white border-white/30">
                                              ID: {item.id}
                                            </Badge>
                                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                              Already Shared
                                            </Badge>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16">
                          <p className="text-sm font-medium text-white mb-1">
                            No Facebook data available
                          </p>
                          <p className="text-xs text-white/80 text-center max-w-md">
                            {totalFacebookDataCount === 0
                              ? "There is no Facebook data in the database to share. Please add Facebook data first."
                              : `All ${totalFacebookDataCount} Facebook data ${totalFacebookDataCount === 1 ? 'entry has' : 'entries have'} already been shared.`}
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-3 flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setShareDialogOpen(false);
                setSelectedRequest(null);
                setSelectedDataIds([]);
                setAvailableFacebookData([]);
                setTotalFacebookDataCount(0);
                setAlreadySharedCount(0);
              }}
              disabled={sharing}
              className="flex-1 sm:flex-initial"
            >
              Cancel
            </Button>
            <Button
              onClick={handleShareFacebookData}
              disabled={sharing || selectedDataIds.length === 0 || availableFacebookData.length === 0}
              className="flex-1 sm:flex-initial bg-primary hover:bg-primary/90 text-primary-foreground font-semibold min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
              size="lg"
            >
              {sharing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="mr-2 h-4 w-4" />
                  Approve & Share {selectedDataIds.length > 0 && `(${selectedDataIds.length})`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </>
  );
};

export default DataRequestsView;
