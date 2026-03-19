import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, CheckCircle2, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EditRequest {
  id: string;
  facebook_data_id?: number;
  company_id?: string;
  facebook_data_share_id?: string;
  requested_by_id: string;
  request_message: string;
  status: "pending" | "approved" | "rejected";
  approved_by_id?: string;
  approved_at?: string;
  created_at: string;
  company_name?: string | null;
  owner_name?: string | null;
  phone?: string | null;
  email?: string | null;
  products?: string | null;
  services?: string | null;
  products_services?: string | null;
  address?: string | null;
  requested_by?: {
    display_name: string | null;
    email: string | null;
  } | null;
  target_data?: {
    name: string | null;
    email: string | null;
  } | null;
  original_data?: any; // To store the full current record for comparison
  is_company?: boolean;
}

const EditRequestsView = () => {
  const [facebookRequests, setFacebookRequests] = useState<EditRequest[]>([]);
  const [companyRequests, setCompanyRequests] = useState<EditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<EditRequest | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    fetchAllRequests();
  }, []);

  const fetchAllRequests = async () => {
    setLoading(true);
    await Promise.all([
      fetchFacebookEditRequests(),
      fetchCompanyEditRequests()
    ]);
    setLoading(false);
  };

  const fetchFacebookEditRequests = async () => {
    try {
      const { data: requestsData, error: requestsError } = await (supabase
        .from("facebook_data_edit_requests" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any);

      if (requestsError) throw requestsError;

      if (!requestsData || requestsData.length === 0) {
        setFacebookRequests([]);
        return;
      }

      const enriched = await enrichRequests(requestsData, "facebook_data");
      setFacebookRequests(enriched);
    } catch (error: any) {
      console.error("Error fetching Facebook edit requests:", error);
      setFacebookRequests([]);
    }
  };

  const fetchCompanyEditRequests = async () => {
    try {
      const { data: requestsData, error: requestsError } = await (supabase
        .from("company_edit_requests" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any);

      if (requestsError) {
        if (requestsError.code === "PGRST204") {
          console.warn("company_edit_requests table not found");
          return;
        }
        throw requestsError;
      }

      if (!requestsData || requestsData.length === 0) {
        setCompanyRequests([]);
        return;
      }

      const enriched = await enrichRequests(requestsData, "companies");
      setCompanyRequests(enriched.map(r => ({ ...r, is_company: true })));
    } catch (error: any) {
      console.error("Error fetching Company edit requests:", error);
      setCompanyRequests([]);
    }
  };

  const enrichRequests = async (requestsData: any[], type: "facebook_data" | "companies") => {
    // Fetch user profiles
    const userIds = [...new Set(requestsData.map((r: any) => String(r.requested_by_id)))] as string[];
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds);

    const profilesMap = new Map();
    if (profilesData) {
      profilesData.forEach((profile: any) => {
        profilesMap.set(profile.id, profile);
      });
    }

    // Fetch target data
    const targetIds = [...new Set(requestsData.map((r: any) => type === "facebook_data" ? r.facebook_data_id : r.company_id))];
    let targetMap = new Map();
    
    try {
      const selectFields = type === "facebook_data" 
        ? "id, name, email, phone, company_name, owner_name, products, services"
        : "id, company_name, owner_name, email, phone, products_services, address";

      const { data: targets } = await (supabase
        .from(type as any)
        .select(selectFields)
        .in("id", targetIds) as any);
      
      if (targets) {
        targets.forEach((item: any) => {
          targetMap.set(item.id, {
            name: type === "facebook_data" ? (item.company_name || item.name) : item.company_name,
            email: item.email,
            full_record: item // Store the full record for comparison
          });
        });
      }
    } catch (err) {
      console.warn(`Could not fetch target data for ${type}:`, err);
    }

    return requestsData.map((request: any) => {
      const target = targetMap.get(type === "facebook_data" ? request.facebook_data_id : request.company_id);
      return {
        ...request,
        requested_by: profilesMap.get(request.requested_by_id) || null,
        target_data: target ? { name: target.name, email: target.email } : null,
        original_data: target ? target.full_record : null
      };
    });
  };

  const handleApprove = async (request: EditRequest) => {
    setSelectedRequest(request);
    const typeLabel = request.is_company ? "Company" : "Facebook";
    if (
      confirm(
        `Approve ${typeLabel} edit request from ${request.requested_by?.display_name || "employee"}?`
      )
    ) {
      await updateRequestStatus(request, "approved");
    }
  };

  const handleReject = async (request: EditRequest) => {
    if (
      confirm(
        `Reject edit request from ${request.requested_by?.display_name || "employee"}?`
      )
    ) {
      await updateRequestStatus(request, "rejected");
    }
  };

  const updateRequestStatus = async (request: EditRequest, status: "approved" | "rejected") => {
    setApproving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (status === "approved") {
        const updatePayload: any = {
          company_name: request.company_name ?? null,
          owner_name: request.owner_name ?? null,
          phone: request.phone ?? null,
          email: request.email ?? null,
        };

        if (request.is_company) {
          updatePayload.products_services = request.products_services ?? null;
          updatePayload.address = request.address ?? null;
          
          await supabase
            .from("companies")
            .update(updatePayload)
            .eq("id", request.company_id);
        } else {
          updatePayload.products = request.products ?? null;
          updatePayload.services = request.services ?? null;
          
          let targetFbId = request.facebook_data_id;
          if (request.facebook_data_share_id) {
            const { data: share } = await (supabase
              .from("facebook_data_shares" as any)
              .select("facebook_data_id")
              .eq("id", request.facebook_data_share_id)
              .maybeSingle() as any);
            if (share?.facebook_data_id) targetFbId = share.facebook_data_id;
          }

          await (supabase
            .from("facebook_data" as any)
            .update(updatePayload)
            .eq("id", targetFbId) as any);
        }
      }

      const updateData = {
        status,
        approved_by_id: user.id,
        approved_at: new Date().toISOString(),
      };

      const table = request.is_company ? "company_edit_requests" : "facebook_data_edit_requests";
      await (supabase
        .from(table as any)
        .update(updateData)
        .eq("id", request.id) as any);

      toast.success(`Request ${status} successfully`);
      fetchAllRequests();
    } catch (error: any) {
      console.error("Error updating request:", error);
      toast.error(error.message || "Failed to update request");
    } finally {
      setApproving(false);
      setSelectedRequest(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-yellow-500 text-white">
            Pending
          </Badge>
        );
    }
  };

  const renderRequestTable = (requests: EditRequest[]) => {
    const pending = requests.filter(r => r.status === "pending");
    const processed = requests.filter(r => r.status !== "pending");

    return (
      <div className="space-y-6">
        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="outline" className="bg-yellow-500 text-white">{pending.length}</Badge>
                Pending Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Target Data</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Requested At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>
                          <div className="font-medium">{req.requested_by?.display_name || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{req.requested_by?.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{req.target_data?.name || "N/A"}</div>
                          <div className="text-xs text-muted-foreground">{req.target_data?.email || "N/A"}</div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{req.request_message || "No message"}</TableCell>
                        <TableCell>{new Date(req.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setSelectedRequest(req)}>View</Button>
                            <Button variant="default" size="sm" onClick={() => handleApprove(req)} className="bg-green-600 hover:bg-green-700">Approve</Button>
                            <Button variant="destructive" size="sm" onClick={() => handleReject(req)}>Reject</Button>
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

        {processed.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Processed Requests ({processed.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Target Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Processed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processed.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>
                          <div className="font-medium">{req.requested_by?.display_name || "Unknown"}</div>
                        </TableCell>
                        <TableCell>{req.target_data?.name || "N/A"}</TableCell>
                        <TableCell>{getStatusBadge(req.status)}</TableCell>
                        <TableCell>{req.approved_at ? new Date(req.approved_at).toLocaleString() : "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {requests.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No requests found here.</div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Edit Requests Approval</h2>
          <p className="text-muted-foreground mt-1 text-white/80">Manage employee requests to update data</p>
        </div>
      </div>

      <Tabs defaultValue="facebook" className="w-full">
        <TabsList className="bg-white/10 text-white">
          <TabsTrigger value="facebook" className="data-[state=active]:bg-primary">Facebook Data ({facebookRequests.length})</TabsTrigger>
          <TabsTrigger value="company" className="data-[state=active]:bg-primary">Company Data ({companyRequests.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="facebook" className="mt-6">
          {renderRequestTable(facebookRequests)}
        </TabsContent>
        <TabsContent value="company" className="mt-6">
          {renderRequestTable(companyRequests)}
        </TabsContent>
      </Tabs>

      {/* Details Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(o) => !o && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold text-white/50 uppercase">Requested By</p>
                  <p className="text-white font-medium">{selectedRequest.requested_by?.display_name || "Unknown"}</p>
                  <p className="text-xs text-white/70">{selectedRequest.requested_by?.email}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/50 uppercase">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Data Comparison</p>
                  <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                    <span className="text-white/40">Current Data</span>
                    <span className="text-primary-foreground bg-primary px-1.5 rounded">Proposed Change</span>
                  </div>
                </div>
                
                <div className="rounded-lg border border-white/10 overflow-hidden bg-white/5">
                  <Table>
                    <TableHeader className="bg-white/5">
                      <TableRow className="hover:bg-transparent border-white/10">
                        <TableHead className="text-white/50 w-[140px]">Field</TableHead>
                        <TableHead className="text-white/50">Current Value</TableHead>
                        <TableHead className="text-white/50">Requested Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { 
                          label: "Company Name", 
                          old: selectedRequest.is_company ? selectedRequest.original_data?.company_name : (selectedRequest.original_data?.company_name || selectedRequest.original_data?.name),
                          new: selectedRequest.company_name 
                        },
                        { 
                          label: "Owner Name", 
                          old: selectedRequest.original_data?.owner_name,
                          new: selectedRequest.owner_name 
                        },
                        { 
                          label: "Phone", 
                          old: selectedRequest.original_data?.phone,
                          new: selectedRequest.phone 
                        },
                        { 
                          label: "Email", 
                          old: selectedRequest.original_data?.email,
                          new: selectedRequest.email 
                        },
                        { 
                          label: selectedRequest.is_company ? "Products/Services" : "Products", 
                          old: selectedRequest.is_company ? selectedRequest.original_data?.products_services : selectedRequest.original_data?.products,
                          new: selectedRequest.products || selectedRequest.products_services 
                        },
                        { 
                          label: "Services", 
                          old: selectedRequest.original_data?.services,
                          new: selectedRequest.services 
                        },
                        { 
                          label: "Address", 
                          old: selectedRequest.original_data?.address,
                          new: selectedRequest.address 
                        }
                      ].map((field, i) => {
                        const hasChange = field.new && field.old !== field.new;
                        if (!field.new && !field.old) return null;
                        
                        return (
                          <TableRow key={i} className="border-white/5 hover:bg-white/5">
                            <TableCell className="font-medium text-white/70 text-xs">{field.label}</TableCell>
                            <TableCell className="text-red-400/60 text-xs italic line-through">
                              {field.old || "Empty"}
                            </TableCell>
                            <TableCell className={`text-sm font-semibold ${hasChange ? "text-green-400" : "text-white/20"}`}>
                              {field.new || "No change"}
                              {hasChange && (
                                <Badge variant="outline" className="ml-2 h-4 px-1 text-[8px] bg-green-500/10 text-green-500 border-green-500/20">
                                  CHANGED
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {selectedRequest.request_message && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-white/50 uppercase mb-2">Message from Employee</p>
                  <p className="text-sm italic text-white/80">"{selectedRequest.request_message}"</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedRequest?.status === "pending" && (
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => handleReject(selectedRequest)} disabled={approving}>Reject</Button>
                <Button variant="default" onClick={() => handleApprove(selectedRequest)} disabled={approving} className="bg-green-600">Approve & Apply</Button>
              </div>
            )}
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EditRequestsView;
