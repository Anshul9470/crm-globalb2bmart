import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LoginApproval {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  approved_at: string | null;
  approved_by_id: string | null;
  rejection_reason: string | null;
}

const LoginApprovalView = () => {
  const [approvals, setApprovals] = useState<LoginApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const formatDateTime = (value: string | null) => {
    if (!value) return "N/A";
    try {
      return new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return value;
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    try {
      const { data, error } = await supabase
        .from("login_approvals")
        .select("*")
        .order("requested_at", { ascending: false });

      if (error) throw error;

      const approvalsData = data || [];

      // For older rows where user_name / user_email might be null,
      // fetch from profiles table and fill them in for display
      const missingInfoUserIds = approvalsData
        .filter(a => !a.user_name || !a.user_email)
        .map(a => a.user_id);

      let profilesById: Record<string, { display_name: string | null; email: string | null }> = {};

      if (missingInfoUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", missingInfoUserIds);

        profilesById = (profiles || []).reduce((acc: any, profile: any) => {
          acc[profile.id] = {
            display_name: profile.display_name ?? null,
            email: profile.email ?? null,
          };
          return acc;
        }, {} as Record<string, { display_name: string | null; email: string | null }>);
      }

      const enrichedApprovals: LoginApproval[] = approvalsData.map((a: any) => {
        const profile = profilesById[a.user_id];
        const fallbackEmail = profile?.email || null;
        const fallbackName =
          a.user_name ||
          profile?.display_name ||
          fallbackEmail?.split?.("@")?.[0] ||
          null;

        return {
          ...a,
          user_email: a.user_email || fallbackEmail || "N/A",
          user_name: fallbackName,
        };
      });

      // Filter out admin users from the approvals list so that
      // admin login events do not appear in this dashboard
      const userIds = Array.from(new Set(enrichedApprovals.map(a => a.user_id)));
      let rolesByUserId: Record<string, string> = {};

      if (userIds.length > 0) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds);

        rolesByUserId = (roles || []).reduce((acc: any, row: any) => {
          acc[row.user_id] = row.role;
          return acc;
        }, {} as Record<string, string>);
      }

      const nonAdminApprovals = enrichedApprovals.filter(a => rolesByUserId[a.user_id] !== "admin");

      // Deduplicate by user_id and keep the latest request per user
      const latestByUser: Record<string, LoginApproval> = {};
      for (const a of nonAdminApprovals) {
        const existing = latestByUser[a.user_id];
        if (!existing) {
          latestByUser[a.user_id] = a;
        } else {
          if (new Date(a.requested_at).getTime() > new Date(existing.requested_at).getTime()) {
            latestByUser[a.user_id] = a;
          }
        }
      }

      setApprovals(Object.values(latestByUser));
    } catch (error: any) {
      toast.error("Failed to fetch login approvals: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approvalId: string, status: "approved" | "rejected", reason?: string) => {
    setProcessing(approvalId);
    try {
      // Only admins can approve/reject via RLS policy
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Keep update payload minimal to avoid schema mismatches
      const updateData: any = {
        status,
        approved_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("login_approvals")
        .update(updateData)
        .eq("id", approvalId);

      if (error) throw error;

      toast.success(`Login request ${status} successfully`);
      // Notify other parts of the app (e.g. admin sidebar counts)
      window.dispatchEvent(new CustomEvent('loginApprovalsUpdated'));
      fetchApprovals();
    } catch (error: any) {
      toast.error("Failed to update approval: " + error.message);
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const pendingApprovals = approvals.filter(a => a.status === "pending");
  const allApprovals = approvals;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Login Approval Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingApprovals.length === 0 && allApprovals.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No login approval requests found.</p>
          ) : (
            <div className="space-y-4">
              {pendingApprovals.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Pending Approvals ({pendingApprovals.length})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Requested At</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingApprovals.map((approval) => (
                        <TableRow key={approval.id}>
                          <TableCell>{approval.user_name || "N/A"}</TableCell>
                          <TableCell>{approval.user_email}</TableCell>
                          <TableCell>
                            {formatDateTime(approval.requested_at)}
                          </TableCell>
                          <TableCell>{getStatusBadge(approval.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApproval(approval.id, "approved")}
                                disabled={processing === approval.id}
                              >
                                {processing === approval.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Approve"
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleApproval(approval.id, "rejected")}
                                disabled={processing === approval.id}
                              >
                                {processing === approval.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Reject"
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {allApprovals.length > pendingApprovals.length && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">All Requests</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Requested At</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Processed At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allApprovals
                        .filter(a => a.status !== "pending")
                        .map((approval) => (
                          <TableRow key={approval.id}>
                            <TableCell>{approval.user_name || "N/A"}</TableCell>
                            <TableCell>{approval.user_email}</TableCell>
                            <TableCell>
                              {formatDateTime(approval.requested_at)}
                            </TableCell>
                            <TableCell>{getStatusBadge(approval.status)}</TableCell>
                              <TableCell>
                                {formatDateTime(approval.approved_at)}
                              </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginApprovalView;
