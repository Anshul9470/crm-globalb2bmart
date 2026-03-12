import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, CheckCircle2, XCircle } from "lucide-react";
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
  facebook_data_id: number;
  facebook_data_share_id: string;
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
  requested_by?: {
    display_name: string | null;
    email: string | null;
  } | null;
  facebook_data?: {
    name: string | null;
    email: string | null;
  } | null;
}

const EditRequestsView = () => {
  const [requests, setRequests] = useState<EditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<EditRequest | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    fetchEditRequests();
  }, []);

  const fetchEditRequests = async () => {
    setLoading(true);
    try {
      // First, fetch the edit requests
      const { data: requestsData, error: requestsError } = await (supabase
        .from("facebook_data_edit_requests" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any);

      if (requestsError) {
        console.error("Error fetching edit requests:", requestsError);
        
        // Check if table doesn't exist
        if (requestsError.code === "PGRST205" || requestsError.message?.includes("could not find") || requestsError.message?.includes("does not exist")) {
          toast.error("The edit requests table is not found. Please run the SQL script to create it.", { duration: 10000 });
          setRequests([]);
          setLoading(false);
          return;
        }
        
        throw requestsError;
      }

      if (!requestsData || requestsData.length === 0) {
        setRequests([]);
        setLoading(false);
        return;
      }

      // Fetch user profiles for requested_by_id
      const userIds = [...new Set(requestsData.map((r: any) => String(r.requested_by_id)))] as string[];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);

      // Fetch Facebook data
      const facebookDataIds = [...new Set(requestsData.map((r: any) => r.facebook_data_id))];
      let facebookDataMap = new Map();
      
      try {
        const { data: fbData } = await (supabase
          .from("facebook_data" as any)
          .select("id, name, email")
          .in("id", facebookDataIds) as any);
        
        if (fbData) {
          fbData.forEach((item: any) => {
            facebookDataMap.set(item.id, item);
          });
        }
      } catch (fbError: any) {
        console.warn("Could not fetch Facebook data:", fbError);
        // Continue without Facebook data
      }

      // Combine the data
      const profilesMap = new Map();
      if (profilesData) {
        profilesData.forEach((profile: any) => {
          profilesMap.set(profile.id, profile);
        });
      }

      const enrichedRequests = requestsData.map((request: any) => ({
        ...request,
        requested_by: profilesMap.get(request.requested_by_id) || null,
        facebook_data: facebookDataMap.get(request.facebook_data_id) || null,
      }));

      setRequests(enrichedRequests);
    } catch (error: any) {
      console.error("Error fetching edit requests:", error);
      toast.error(error.message || "Failed to load edit requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: EditRequest) => {
    console.log("🔎 Approving edit request:", request);
    setSelectedRequest(request);
    if (
      confirm(
        `Approve edit request from ${request.requested_by?.display_name || "employee"}? The submitted details will be applied directly to this Facebook data.`
      )
    ) {
      await updateRequestStatus(request.id, "approved");
    }
  };

  const handleReject = async (request: EditRequest) => {
    if (
      confirm(
        `Reject edit request from ${request.requested_by?.display_name || "employee"}?`
      )
    ) {
      await updateRequestStatus(request.id, "rejected");
    }
  };

  const updateRequestStatus = async (requestId: string, status: "approved" | "rejected") => {
    setApproving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const request = requests.find((r) => r.id === requestId);
      if (!request) throw new Error("Edit request not found");

      // If approving, first apply the submitted details directly to facebook_data
      if (status === "approved") {
        console.log("📝 Applying approved edit. Original request values:", {
          facebook_data_id: request.facebook_data_id,
          facebook_data_share_id: request.facebook_data_share_id,
          company_name: request.company_name,
          owner_name: request.owner_name,
          phone: request.phone,
          email: request.email,
          products: request.products,
          services: request.services,
        });

        // Extra safety: resolve the real facebook_data_id via facebook_data_shares
        let targetFacebookDataId = request.facebook_data_id;
        try {
          const { data: shareRow, error: shareError } = await (supabase
            .from("facebook_data_shares" as any)
            .select("facebook_data_id")
            .eq("id", request.facebook_data_share_id)
            .maybeSingle() as any);

          if (shareError) {
            console.warn("⚠️ Could not resolve facebook_data_id from facebook_data_shares:", shareError);
          } else if (shareRow?.facebook_data_id) {
            targetFacebookDataId = shareRow.facebook_data_id;
          }
        } catch (e) {
          console.warn("⚠️ Exception while resolving facebook_data_id from shares:", e);
        }

        console.log("🧩 Using facebook_data_id for update:", targetFacebookDataId);

        const updatePayload: any = {
          company_name: request.company_name ?? null,
          owner_name: request.owner_name ?? null,
          phone: request.phone ?? null,
          email: request.email ?? null,
          products: request.products ?? null,
          services: request.services ?? null,
        };

        const { data: updatedRows, error: fbUpdateError } = await (supabase
          .from("facebook_data" as any)
          .update(updatePayload)
          .eq("id", targetFacebookDataId)
          .select("id, company_name, owner_name, phone, email, products, services") as any);

        if (fbUpdateError) {
          console.error("Error applying approved edit to facebook_data:", fbUpdateError);
          throw new Error(fbUpdateError.message || "Failed to apply approved edit to Facebook data");
        }

        if (!updatedRows || updatedRows.length === 0) {
          console.warn("⚠️ No facebook_data rows were updated for edit request:", {
            requestId,
            facebook_data_id: request.facebook_data_id,
          });
          toast.error("No matching Facebook data record was found to update. Please check facebook_data_id.");
        }
      }

      const updateData: any = {
        status,
        approved_by_id: user.id,
        approved_at: new Date().toISOString(),
      };

      const { error } = await (supabase
        .from("facebook_data_edit_requests" as any)
        .update(updateData)
        .eq("id", requestId) as any);

      if (error) throw error;

      toast.success(
        `Edit request ${status === "approved" ? "approved" : "rejected"} successfully`
      );
      fetchEditRequests();
    } catch (error: any) {
      console.error("Error updating edit request:", error);
      toast.error(error.message || "Failed to update edit request");
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

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const processedRequests = requests.filter((r) => r.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Facebook Data Edit Requests</h2>
          <p className="text-muted-foreground mt-1 text-white/80">
            Review and approve/reject employee requests to edit Facebook data
          </p>
        </div>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline" className="bg-yellow-500 text-white">
                {pendingRequests.length}
              </Badge>
              Pending Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Facebook Data</TableHead>
                    <TableHead>Request Message</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {request.requested_by?.display_name || "Unknown"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {request.requested_by?.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {request.facebook_data?.name || "N/A"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {request.facebook_data?.email || "N/A"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md truncate" title={request.request_message}>
                          {request.request_message || "No message"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(request.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedRequest(request)}
                          >
                            View Details
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleApprove(request)}
                            disabled={approving}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReject(request)}
                            disabled={approving}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
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

      {/* Processed Requests */}
      {processedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Processed Requests ({processedRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Facebook Data</TableHead>
                    <TableHead>Request Message</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {request.requested_by?.display_name || "Unknown"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {request.requested_by?.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {request.facebook_data?.name || "N/A"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {request.facebook_data?.email || "N/A"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md truncate" title={request.request_message}>
                          {request.request_message}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(request.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Details Dialog */}
      <Dialog open={!!selectedRequest && !approving} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Request Details</DialogTitle>
            <DialogDescription className="text-white/80">
              Review the data submitted by the employee
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-white/70">Employee</p>
                  <p className="text-base font-medium text-white">
                    {selectedRequest.requested_by?.display_name || "Unknown"}
                  </p>
                  <p className="text-sm text-white/70">
                    {selectedRequest.requested_by?.email}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/70">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
              </div>

              <div className="border-t border-white/20 pt-4">
                <p className="text-sm font-semibold text-white/70 mb-3">Submitted Data</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">Company Name</p>
                    <p className="text-base p-2 bg-white/10 rounded text-white">
                      {selectedRequest.company_name || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">Owner Name</p>
                    <p className="text-base p-2 bg-white/10 rounded text-white">
                      {selectedRequest.owner_name || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">Phone Number</p>
                    <p className="text-base p-2 bg-white/10 rounded text-white">
                      {selectedRequest.phone || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">Email Address</p>
                    <p className="text-base p-2 bg-white/10 rounded text-white">
                      {selectedRequest.email || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <p className="text-sm font-semibold text-white">Products</p>
                    <p className="text-base p-2 bg-white/10 rounded min-h-[60px] text-white">
                      {selectedRequest.products || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <p className="text-sm font-semibold text-white">Services</p>
                    <p className="text-base p-2 bg-white/10 rounded min-h-[60px] text-white">
                      {selectedRequest.services || "N/A (Optional)"}
                    </p>
                  </div>
                </div>
              </div>

              {selectedRequest.request_message && (
                <div className="border-t border-white/20 pt-4">
                  <p className="text-sm font-semibold text-white/70 mb-2">Additional Notes</p>
                  <p className="text-base p-2 bg-white/10 rounded text-white">
                    {selectedRequest.request_message}
                  </p>
                </div>
              )}

              <div className="border-t border-white/20 pt-4">
                <p className="text-sm text-white/70">
                  Requested at: {new Date(selectedRequest.created_at).toLocaleString()}
                </p>
                {selectedRequest.approved_at && (
                  <p className="text-sm text-white/70">
                    {selectedRequest.status === "approved" ? "Approved" : "Rejected"} at:{" "}
                    {new Date(selectedRequest.approved_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedRequest && selectedRequest.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setSelectedRequest(null)}
                >
                  Close
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleReject(selectedRequest);
                    setSelectedRequest(null);
                  }}
                  disabled={approving}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    handleApprove(selectedRequest);
                    setSelectedRequest(null);
                  }}
                  disabled={approving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </>
            )}
            {selectedRequest && selectedRequest.status !== "pending" && (
              <Button onClick={() => setSelectedRequest(null)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {requests.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Pencil className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Edit Requests</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              There are no Facebook data edit requests at this time.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EditRequestsView;

