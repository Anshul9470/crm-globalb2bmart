import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Check, X, User, Users, Clock, CheckCircle2, XCircle } from "lucide-react";
import FacebookDataCard from "./FacebookDataCard";

const CompanyApprovalView = () => {
  const [newListedData, setNewListedData] = useState<any[]>([]);
  const [shiftedData, setShiftedData] = useState<any[]>([]);
  const [rejectedData, setRejectedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [totalNewListed, setTotalNewListed] = useState(0);
  const [totalShifted, setTotalShifted] = useState(0);
  const [totalRejected, setTotalRejected] = useState(0);


  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch new listed data (pending approval OR NULL status)
      const { data: pendingData, error: pendingError } = await (supabase
        .from("companies" as any)
        .select(`
          *,
          created_by:profiles!created_by_id(display_name, email)
        `)
        .or('approval_status.eq.pending,approval_status.is.null')
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(15000) as any);

      if (pendingError) throw pendingError;

      // Fetch rejected data (Not Shortlisted)
      const { data: rejected, error: rejectedError } = await (supabase
        .from("companies" as any)
        .select(`
          *,
          created_by:profiles!created_by_id(display_name, email)
        `)
        .eq("approval_status", "rejected")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10000) as any);

      if (rejectedError) throw rejectedError;

      // Fetch shifted data (all approved companies)
      const { data: shifted, error: shiftedError } = await (supabase
        .from("companies" as any)
        .select(`
          *,
          created_by:profiles!created_by_id(display_name, email),
          assigned_to:profiles!assigned_to_id(display_name, email)
        `)
        .eq("approval_status", "approved")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10000) as any);

      if (shiftedError) throw shiftedError;

      // Fetch Facebook data for shifted/all companies view
      const { data: fbData, error: fbError } = await (supabase
        .from("facebook_data" as any)
        .select(`*`)
        .is("deleted_at", null)
        .is("deletion_state", null)
        .order("created_at", { ascending: false })
        .limit(10000) as any);

      if (fbError) {
        console.warn("Facebook data fetch failed:", fbError);
      }

      const rawCombinedShiftedData = [
        ...(shifted || []),
        ...(fbData || []).map((fb: any) => ({
          ...fb,
          is_facebook_data: true,
        })),
      ];

      // Deduplicate by phone number, keeping facebook_data over companies
      const deduplicatedMap = new Map();
      rawCombinedShiftedData.forEach((item) => {
        // Only deduplicate if phone exists
        if (item.phone) {
          const existing = deduplicatedMap.get(item.phone);
          if (existing) {
            // Keep the one that IS facebook data
            if (!existing.is_facebook_data && item.is_facebook_data) {
              deduplicatedMap.set(item.phone, item);
            }
          } else {
            deduplicatedMap.set(item.phone, item);
          }
        } else {
          // Fallback key using ID if no phone
          deduplicatedMap.set(`id-${item.id}-${item.is_facebook_data}`, item);
        }
      });

      const combinedShiftedData = Array.from(deduplicatedMap.values());

      combinedShiftedData.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Fetch exact counts
      const [pendingCountRes, rejectedCountRes, shiftedCountRes, fbCountRes] = await Promise.all([
        supabase
          .from("companies" as any)
          .select("*", { count: "exact", head: true })
          .or('approval_status.eq.pending,approval_status.is.null')
          .is("deleted_at", null) as any,
        supabase
          .from("companies" as any)
          .select("*", { count: "exact", head: true })
          .eq("approval_status", "rejected")
          .is("deleted_at", null) as any,
        supabase
          .from("companies" as any)
          .select("*", { count: "exact", head: true })
          .eq("approval_status", "approved")
          .is("deleted_at", null) as any,
        supabase
          .from("facebook_data" as any)
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null) as any
      ]);

      setTotalNewListed(pendingCountRes.count || 0);
      setTotalRejected(rejectedCountRes.count || 0);
      setTotalShifted(combinedShiftedData.length);

      setNewListedData(pendingData || []);
      setRejectedData(rejected || []);
      setShiftedData(combinedShiftedData);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error(error.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAll = async () => {
    if (newListedData.length === 0) return;
    if (!confirm(`Are you sure you want to approve all ${newListedData.length} companies?`)) return;

    setIsApprovingAll(true);
    try {
      const nowIso = new Date().toISOString();

      // Group by creator to assign properly back to who created them
      const groups = newListedData.reduce((acc: any, company: any) => {
        const creatorId = company.created_by_id;
        // Handle null creator IDs
        const key = creatorId || "null";
        if (!acc[key]) acc[key] = [];
        acc[key].push(company.id);
        return acc;
      }, {});

      // Process in batches to avoid API limits (100 items per request to avoid URL too long error)
      let totalApproved = 0;
      for (const [creatorKey, ids] of Object.entries(groups)) {
        const batchSize = 100;
        const companyIds = ids as string[];
        const actualCreatorId = creatorKey === "null" ? null : creatorKey;

        for (let i = 0; i < companyIds.length; i += batchSize) {
          const batchIds = companyIds.slice(i, i + batchSize);

          const { error } = await (supabase
            .from("companies" as any)
            .update({
              approval_status: "approved",
              assigned_to_id: actualCreatorId,
              assigned_at: nowIso
            })
            .in("id", batchIds) as any);

          if (error) throw error;
          totalApproved += batchIds.length;
        }
      }

      toast.success(`Successfully approved ${totalApproved} companies. (Refresh and click again if more remain)`);

      await fetchData();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("companyDataUpdated"));
      }
    } catch (error: any) {
      console.error("Error approving all:", error);
      toast.error(error.message || "Failed to approve all companies");
    } finally {
      setIsApprovingAll(false);
    }
  };

  const handleApprove = async (company: any) => {
    setProcessingId(company.id);
    try {
      const nowIso = new Date().toISOString();

      // 1. Check for phone number duplicate in existing approved companies
      if (company.phone) {
        const { data: duplicates, error: dupError } = await (supabase
          .from("companies" as any)
          .select(`
            id,
            company_name,
            phone,
            approval_status,
            assigned_to:profiles!assigned_to_id(display_name, email)
          `)
          .eq("phone", company.phone)
          .neq("id", company.id)
          .is("deleted_at", null) as any);

        if (!dupError && duplicates && duplicates.length > 0) {
          // Duplicate found — auto-reject (Nonshifted) and show who has it
          const dup = duplicates[0];
          const ownerName = dup.assigned_to?.display_name || "Unknown";
          const ownerEmail = dup.assigned_to?.email || "";

          const { error: rejectError } = await (supabase
            .from("companies" as any)
            .update({
              approval_status: "rejected",
              assigned_to_id: null,
              assigned_at: null
            })
            .eq("id", company.id) as any);

          if (rejectError) throw rejectError;

          toast.error(
            `⚠️ Duplicate phone (${company.phone})! Data already exists with "${ownerName}" (${ownerEmail}). Moved to Nonshifted.`,
            { duration: 8000 }
          );

          await fetchData();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("companyDataUpdated"));
          }
          return;
        }
      }

      // 2. No duplicate — approve normally → goes to Shifted & All Companies
      const { error } = await (supabase
        .from("companies" as any)
        .update({
          approval_status: "approved",
          assigned_to_id: company.created_by_id,
          assigned_at: nowIso
        })
        .eq("id", company.id) as any);

      if (error) throw error;

      toast.success(`✅ Company "${company.company_name}" approved and moved to Shifted.`);

      await fetchData();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("companyDataUpdated"));
      }
    } catch (error: any) {
      console.error("Error approving company:", error);
      toast.error(error.message || "Failed to approve company");
    } finally {
      setProcessingId(null);
    }
  };


  const handleReject = async (company: any) => {
    setProcessingId(company.id);
    try {
      // Set status to rejected
      // These will be filtered into a "Not Shortlisted" or hidden view
      const { error } = await (supabase
        .from("companies" as any)
        .update({
          approval_status: "rejected",
          assigned_to_id: null,
          assigned_at: null
        })
        .eq("id", company.id) as any);

      if (error) throw error;

      toast.success(`Company "${company.company_name}" rejected (Moved to Not Shortlisted)`);

      // Refresh data
      await fetchData();
    } catch (error: any) {
      console.error("Error rejecting company:", error);
      toast.error(error.message || "Failed to reject company");
    } finally {
      setProcessingId(null);
    }
  };

  const CompanyCard = ({ company, showActions = true }: { company: any; showActions?: boolean }) => (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg text-white">{company.company_name}</CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="flex items-center gap-1 ">
                <User className="h-3 w-3" />
                {company.created_by?.display_name || "Unknown"}
              </Badge>
              <Badge variant="outline" className="">
                {company.created_by?.email || ""}
              </Badge>
            </div>
          </div>
          {showActions && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleApprove(company)}
                disabled={processingId === company.id}
                className="bg-green-600 hover:bg-green-700"
              >
                {processingId === company.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleReject(company)}
                disabled={processingId === company.id}
              >
                {processingId === company.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm ">
          <div>
            <p className="text-muted-foreground ">Owner Name</p>
            <p className="">{company.owner_name}</p>
          </div>
          <div>
            <p className="text-muted-foreground ">Phone</p>
            <p className="">{company.phone}</p>
          </div>
          {company.email && (
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="">{company.email}</p>
            </div>
          )}
          {company.address && (
            <div>
              <p className="text-muted-foreground ">Address</p>
              <p className="">{company.address}</p>
            </div>
          )}
          {company.products_services && (
            <div className="md:col-span-2">
              <p className="text-muted-foreground ">Products & Services</p>
              <p className="">{company.products_services}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground ">Created At</p>
            <p className="">{new Date(company.created_at).toLocaleString()}</p>
          </div>
          {company.assigned_to && (
            <div>
              <p className="text-muted-foreground ">Assigned To</p>
              <p className="">{company.assigned_to.display_name}</p>
            </div>
          )}
          {company.assigned_at && (
            <div>
              <p className="text-muted-foreground ">Assigned At</p>
              <p className="">{new Date(company.assigned_at).toLocaleString()}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-white">Company Approval Management</h2>

      <Tabs defaultValue="new-listed" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8 h-auto">
          <TabsTrigger value="new-listed" className="py-3 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            <span>New Listed Data</span>
            <span className="ml-2 bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
              {totalNewListed}
            </span>
          </TabsTrigger>
          <TabsTrigger value="shifted" className="py-3 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Shifted</span>
            <span className="ml-2 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">
              {totalShifted}
            </span>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="py-3 flex items-center justify-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span>Nonshifted</span>
            <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">
              {totalRejected}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new-listed">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                New Listed Data ({totalNewListed})
              </h3>
              {newListedData.length > 0 && (
                <Button
                  onClick={handleApproveAll}
                  disabled={isApprovingAll || processingId !== null}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isApprovingAll ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving All...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Approve All</>
                  )}
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Companies pending approval
            </p>
            {newListedData.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No new companies pending approval.
                </CardContent>
              </Card>
            ) : (
              newListedData.map((company) => (
                <Card key={company.id} className="overflow-hidden border-2 hover:border-primary/20 transition-all">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-full text-primary">
                            <Users className="w-4 h-4" />
                          </div>
                          <div className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-full text-sm font-medium">
                            <User className="w-3.5 h-3.5" />
                            {company.created_by?.display_name || "Admin"}
                            <span className="text-muted-foreground mx-1">•</span>
                            {company.created_by?.email}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Owner Name</p>
                            <p className="text-lg font-bold text-foreground">{company.owner_name}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Phone</p>
                            <p className="text-lg font-bold text-foreground">p:{company.phone}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Created At</p>
                            <p className="text-sm font-medium">{new Date(company.created_at).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Assigned At</p>
                            <p className="text-sm font-medium">{company.assigned_at ? new Date(company.assigned_at).toLocaleString() : "Not assigned"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row md:flex-col gap-3 min-w-[140px]">
                        <Button
                          onClick={() => handleApprove(company)}
                          disabled={processingId === company.id}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-6"
                        >
                          {processingId === company.id ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="w-5 h-5 mr-2" />
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleReject(company)}
                          variant="destructive"
                          disabled={processingId === company.id}
                          className="flex-1 font-bold py-6"
                        >
                          <XCircle className="w-5 h-5 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="shifted">
          <div>
            <h3 className="text-xl font-semibold mb-4 text-white">
              Shifted Data ({totalShifted})
            </h3>
            <p className="text-sm text-muted-foreground mb-4 text-white/70">
              Companies that have been assigned/shifted to employees
            </p>
            {shiftedData.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-white">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No companies have been assigned yet</p>
                </CardContent>
              </Card>
            ) : (
              shiftedData.map((company) => (
                company.is_facebook_data ? (
                  <div key={`fb-${company.id}`} className="mb-4">
                    <FacebookDataCard 
                      data={company} 
                      onUpdate={fetchData} 
                      userRole="admin" 
                    />
                  </div>
                ) : (
                  <CompanyCard key={`comp-${company.id}`} company={company} showActions={false} />
                )
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="rejected">
          <div className="space-y-4">
            <h3 className="text-xl font-semibold mb-4 text-white">Nonshifted ({totalRejected})</h3>
            <p className="text-sm text-muted-foreground mb-4 text-white/70">
              Companies that have been rejected and were not shortlisted for assignment
            </p>
            {rejectedData.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground text-white">
                  <XCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No rejected companies.</p>
                </CardContent>
              </Card>
            ) : (
              rejectedData.map((company) => (
                <div key={company.id} className="relative group">
                  <div className="absolute top-4 right-4 z-10">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                      onClick={() => handleApprove(company)}
                      disabled={processingId === company.id}
                    >
                      Restore & Approve
                    </Button>
                  </div>
                  <CompanyCard company={company} showActions={false} />
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div >
  );
};

export default CompanyApprovalView;
