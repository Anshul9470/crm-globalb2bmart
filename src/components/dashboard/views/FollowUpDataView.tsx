import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CompanyCard from "@/components/CompanyCard";
import FacebookDataCard from "@/components/dashboard/views/FacebookDataCard";
import { Loader2, CalendarCheck, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface FollowUpDataViewProps {
  userId: string;
  userRole?: string;
}

const CompanyCardSkeleton = () => (
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
        <Skeleton className="h-4 w-4/6" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-10" />
      </div>
    </CardContent>
  </Card>
);

const FollowUpDataView = ({ userId, userRole }: FollowUpDataViewProps) => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [facebookData, setFacebookData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvedEditRequests, setApprovedEditRequests] = useState<Set<number>>(new Set());
  const [shareIdMap, setShareIdMap] = useState<Record<number, string>>({});

  // Edit request states for employees
  const [editRequestDialogOpen, setEditRequestDialogOpen] = useState(false);
  const [requestingEditData, setRequestingEditData] = useState<any>(null);
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

  useEffect(() => {
    fetchFollowUpData();
    if (userRole !== "admin") {
      fetchApprovedEditRequests();
      fetchShareIdMap();
    }

    // Listen for Facebook data updates (e.g., when deleted from another view)
    const handleFacebookDataUpdate = () => {
      fetchFollowUpData();
    };

    window.addEventListener("facebookDataUpdated", handleFacebookDataUpdate);

    return () => {
      window.removeEventListener("facebookDataUpdated", handleFacebookDataUpdate);
    };
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

  const fetchShareIdMap = async () => {
    try {
      const { data: shares } = await (supabase
        .from("facebook_data_shares" as any)
        .select("facebook_data_id, id")
        .eq("employee_id", userId) as any);

      if (shares) {
        const shareMap: Record<number, string> = {};
        shares.forEach((share: any) => {
          shareMap[share.facebook_data_id] = share.id;
        });
        setShareIdMap(shareMap);
      }
    } catch (error) {
      console.error("Error fetching share ID map:", error);
    }
  };

  const handleRequestEditClick = (data: any) => {
    setRequestingEditData(data);
    setEditRequestMessage("");
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
      if (!shareId) {
        toast.error("Share ID not found. Please refresh the page and try again.");
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
        console.error("Error submitting edit request:", error);
        toast.error(error.message || "Failed to submit edit request");
        setSubmittingRequest(false);
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
      fetchApprovedEditRequests();
    } catch (error: any) {
      console.error("Error submitting edit request:", error);
      toast.error(error.message || "Failed to submit edit request");
    } finally {
      setSubmittingRequest(false);
    }
  };


  const handleDelete = async (fb: any) => {
    if (!confirm("Are you sure you want to delete this Facebook data?")) return;

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      if (userRole !== "admin") {
        // Employee: move to inactive via comment
        const { error: commentError } = await (supabase
          .from("facebook_data_comments" as any)
          .insert([{
            facebook_data_id: fb.id,
            user_id: userData.user.id,
            comment_text: "Moved to Inactive by employee",
            category: "block",
            comment_date: new Date().toISOString().slice(0, 10),
          }]) as any);

        if (commentError) throw commentError;

        // Also update deletion_state
        await (supabase
          .from("facebook_data" as any)
          .update({
            deletion_state: 'inactive' as any,
            deleted_at: new Date().toISOString(),
            deleted_by_id: userData.user.id
          })
          .eq("id", fb.id) as any);

        toast.success("Facebook data moved to Inactive section");
        fetchFollowUpData();
        return;
      }

      // Admin: move to admin_recycle
      const { error: updateError } = await (supabase
        .from("facebook_data" as any)
        .update({
          deletion_state: 'admin_recycle' as any,
          deleted_at: new Date().toISOString(),
          deleted_by_id: userData.user.id
        })
        .eq("id", fb.id) as any);

      if (updateError) {
        if (updateError.message?.includes("deletion_state") || updateError.code === "PGRST204") {
          toast.error("Migration missing. Falling back to permanent delete.");
          const { error: deleteError } = await (supabase
            .from("facebook_data" as any)
            .delete()
            .eq("id", fb.id) as any);
          if (deleteError) throw deleteError;
        } else {
          throw updateError;
        }
      } else {
        toast.success("Facebook data moved to recycle bin");
      }

      fetchFollowUpData();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("facebookDataUpdated"));
      }
    } catch (error: any) {
      console.error("Error deleting Facebook data:", error);
      toast.error(error.message || "Failed to delete Facebook data");
    }
  };

  const fetchFollowUpData = async () => {
    setLoading(true);

    const { data: userCompanies, error: companiesError } = await supabase
      .from("companies")
      .select(`
        *,
        comments (
          id, comment_text, category, comment_date, created_at, user_id,
          user:profiles!user_id (display_name, email)
        )
      `)
      .eq("assigned_to_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    let activeCompanies: any[] = [];
    if (!companiesError && userCompanies) {
      activeCompanies = userCompanies.filter((company: any) => !company.deletion_state);
    }

    let rawFbData: any[] = [];
    if (userRole === "employee") {
      const { data: shares } = await (supabase
        .from("facebook_data_shares" as any)
        .select("facebook_data_id, id, created_at")
        .eq("employee_id", userId) as any);

      if (shares && shares.length > 0) {
        const fbIds = shares.map((s: any) => s.facebook_data_id);
        const shareDateMap: Record<number, string> = {};
        shares.forEach((share: any) => {
          if (share.created_at) shareDateMap[share.facebook_data_id] = share.created_at;
        });

        const { data: fbData } = await (supabase
          .from("facebook_data" as any)
          .select("*")
          .in("id", fbIds) as any);

        if (fbData) {
          const { data: comments } = await (supabase
            .from("facebook_data_comments" as any)
            .select(`
              id, facebook_data_id, comment_text, category, comment_date, created_at, user_id,
              user:profiles!user_id(display_name, email)
            `)
            .in("facebook_data_id", fbIds) as any);

          rawFbData = fbData.map((fb: any) => ({
            ...fb,
            is_facebook_data: true,
            shared_at: shareDateMap[fb.id] || null,
            comments: (comments || []).filter((c: any) => c.facebook_data_id === fb.id)
              .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          })).filter((fb: any) => {
            if (fb.deletion_state || fb.deleted_at) return false;
            if (!fb.comments || fb.comments.length === 0) return false;
            const latestComment = fb.comments[0];
            return latestComment && latestComment.category === "follow_up";
          });
        }
      }
    } else if (userRole === "admin") {
      const { data: fbData } = await (supabase.from("facebook_data" as any).select("*") as any);
      if (fbData) {
        const { data: comments } = await (supabase
          .from("facebook_data_comments" as any)
          .select(`
            id, facebook_data_id, comment_text, category, comment_date, created_at, user_id,
            user:profiles!user_id(display_name, email)
          `) as any);

        rawFbData = fbData.map((fb: any) => ({
          ...fb,
          is_facebook_data: true,
          comments: (comments || []).filter((c: any) => c.facebook_data_id === fb.id)
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        })).filter((fb: any) => {
          if (fb.deletion_state || fb.deleted_at) return false;
          if (!fb.comments || fb.comments.length === 0) return false;
          const latestComment = fb.comments[0];
          return latestComment && latestComment.category === "follow_up";
        });
      }
    }

    // Combine and deduplicate
    const followUpCompanies = activeCompanies.filter((company: any) => {
      if (!company.comments || company.comments.length === 0) return false;
      const latestComment = company.comments.reduce((latest: any, current: any) => {
        if (!latest) return current;
        return new Date(current.created_at) > new Date(latest.created_at) ? current : latest;
      }, null);
      return latestComment && latestComment.category === "follow_up";
    });

    const combinedRaw = [
      ...followUpCompanies,
      ...rawFbData
    ];

    const deduplicatedMap = new Map();
    combinedRaw.forEach((item) => {
      if (item.phone) {
        const existing = deduplicatedMap.get(item.phone);
        if (existing) {
          if (!existing.is_facebook_data && item.is_facebook_data) {
            deduplicatedMap.set(item.phone, item);
          }
        } else {
          deduplicatedMap.set(item.phone, item);
        }
      } else {
        deduplicatedMap.set(`id-${item.id}-${item.is_facebook_data ? 'fb' : 'comp'}`, item);
      }
    });

    const finalCombined = Array.from(deduplicatedMap.values());
    finalCombined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setCompanies(finalCombined.filter(i => !i.is_facebook_data).map(c => ({
      ...c,
      comments: c.comments?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || []
    })));
    setFacebookData(finalCombined.filter(i => i.is_facebook_data));

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <CalendarCheck className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold text-white">Active Pool</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <CompanyCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <CalendarCheck className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">Active Pool</h2>
            <p className="text-sm text-white/80 mt-1">
              Companies requiring follow-up actions
            </p>
          </div>
        </div>
        {(companies.length > 0 || facebookData.length > 0) && (
          <div className="px-4 py-2 bg-orange-100 rounded-full">
            <span className="text-sm font-semibold text-orange-600">
              {companies.length + facebookData.length} {companies.length + facebookData.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        )}
      </div>
      {companies.length === 0 && facebookData.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No follow-up data</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              There are no companies or Facebook data in follow-up status. Add comments with the follow-up category to see them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 items-stretch">
          {companies.map((company: any) => (
            <CompanyCard
              key={company.id}
              company={company}
              onUpdate={fetchFollowUpData}
              canDelete={true}
              userRole={userRole}
            />
          ))}
          {facebookData.map((fb: any) => (
            <FacebookDataCard
              key={fb.id}
              data={fb}
              onUpdate={fetchFollowUpData}
              userRole={userRole}
              onDelete={() => handleDelete(fb)}
              onRequestEdit={userRole !== "admin" && !approvedEditRequests.has(fb.id) ? () => handleRequestEditClick(fb) : undefined}
              approvedForEdit={approvedEditRequests.has(fb.id)}
            />
          ))}
        </div>
      )}

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

export default FollowUpDataView;
