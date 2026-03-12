import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Share2, Phone, Mail, Building2, User, Calendar, Search, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import FacebookDataCard from "./FacebookDataCard";

interface FacebookDeleteData {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  owner_name: string | null;
  products: string | null;
  services: string | null;
  created_at: string;
  deleted_at: string;
  deletion_state: string;
  deleted_by: {
    display_name: string;
    email: string;
  } | null;
  comments: Array<{
    id: string;
    comment_text: string;
    category: string;
    created_at: string;
    user: {
      display_name: string;
      email: string;
    };
  }>;
}

const FacebookDeleteDataView = () => {
  const [facebookData, setFacebookData] = useState<FacebookDeleteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [restoring, setRestoring] = useState<number | null>(null);
  const [permanentlyDeleting, setPermanentlyDeleting] = useState<number | null>(null);

  const fetchDeletedFacebookData = async () => {
    try {
      setLoading(true);

      // Query all admin_recycle Facebook data first, then filter by team lead role
      console.log("🔍 FacebookDeleteDataView - Fetching Facebook data deleted by team leads");

      const { data: allAdminRecycle, error: queryError } = await (supabase
        .from("facebook_data" as any)
        .select(`
          *,
          created_at,
          deleted_by_id,
          deleted_by:profiles!facebook_data_deleted_by_id_fkey(display_name, email)
        `)
        .eq("deletion_state", "admin_recycle")
        .order("deleted_at", { ascending: false }) as any);

      if (queryError) {
        console.error("Error fetching deleted Facebook data:", queryError);
        setFacebookData([]);
        setLoading(false);
        return;
      }

      if (!allAdminRecycle || allAdminRecycle.length === 0) {
        setFacebookData([]);
        setLoading(false);
        return;
      }

      // Get all unique deleted_by_ids
      const deletedByIds = [...new Set(allAdminRecycle.map((fb: any) => fb.deleted_by_id).filter(Boolean))];

      console.log("🔍 FacebookDeleteDataView - Checking roles for deleted_by_ids:", {
        deletedByIds: deletedByIds,
        count: deletedByIds.length
      });

      // Get admin IDs and team lead IDs
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const { data: teamLeads } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "team_lead");

      // Also check teams table for team leads (in case user_roles isn't up to date)
      const { data: teamsData, error: teamsError } = await (supabase
        .from("teams" as any)
        .select("team_lead_id") as any);

      const adminIds = admins?.map((a: any) => a.user_id) || [];
      const teamLeadIdsFromRoles = teamLeads?.map((tl: any) => tl.user_id) || [];
      const teamLeadIdsFromTeams = teamsData?.map((t: any) => t.team_lead_id).filter(Boolean) || [];

      // Combine team lead IDs from both sources
      let allTeamLeadIds = [...new Set([...teamLeadIdsFromRoles, ...teamLeadIdsFromTeams])];

      // Check all deleted_by_ids against teams table to find any team leads not in user_roles
      const deletedByIdsInTeams = deletedByIds.filter((id: string) =>
        teamsData?.some((t: any) => t.team_lead_id === id)
      );

      // Add any team leads found in teams table that weren't already in the list
      const additionalTeamLeadIds = deletedByIdsInTeams.filter((id: string) => !allTeamLeadIds.includes(id));
      if (additionalTeamLeadIds.length > 0) {
        console.log("⚠️ FacebookDeleteDataView - Found additional team leads in teams table:", additionalTeamLeadIds);
        allTeamLeadIds.push(...additionalTeamLeadIds);
      }

      console.log("🔍 FacebookDeleteDataView - Role IDs:", {
        adminIds: adminIds,
        adminCount: adminIds.length,
        teamLeadIdsFromRoles: teamLeadIdsFromRoles,
        teamLeadIdsFromTeams: teamLeadIdsFromTeams,
        deletedByIdsInTeams: deletedByIdsInTeams,
        additionalTeamLeadIds: additionalTeamLeadIds,
        allTeamLeadIds: allTeamLeadIds,
        teamLeadCount: allTeamLeadIds.length
      });

      // Filter to show Facebook data deleted by team leads OR non-admins
      // Priority: If user is a team lead (even if also admin), include their deletions
      // Otherwise, include if they're not an admin
      // CRITICAL FIX: Since deletion_state='admin_recycle' is set when team leads delete from recycle bin,
      // and we can't reliably distinguish team lead deletions from admin deletions,
      // we'll include ALL admin_recycle deletions. The sections are specifically for team lead deletions,
      // and if an admin also has team lead permissions, their deletions should appear here.
      const data = allAdminRecycle.filter((fb: any) => {
        // If deleted_by_id is null/undefined, still include it (might be legacy data or system deletion)
        if (!fb.deleted_by_id) {
          // Include items without deleted_by_id as they might be team lead deletions
          // that weren't properly tracked
          return true;
        }

        // If deleted by a team lead, always include (even if they're also an admin)
        const isTeamLead = allTeamLeadIds.includes(fb.deleted_by_id);
        if (isTeamLead) {
          return true;
        }

        // If not an admin, include it (this handles team leads not in user_roles/teams)
        const isNotAdmin = !adminIds.includes(fb.deleted_by_id);
        if (isNotAdmin) {
          return true;
        }

        // Special case: If admin deleted but they're also in teams table as team_lead_id,
        // include it (they might be acting as team lead)
        const isAdminButAlsoTeamLead = adminIds.includes(fb.deleted_by_id) &&
          teamsData?.some((t: any) => t.team_lead_id === fb.deleted_by_id);

        if (isAdminButAlsoTeamLead) {
          return true;
        }

        // CRITICAL FIX: Include ALL admin_recycle deletions since we can't reliably distinguish
        // team lead deletions from admin deletions. This ensures team lead deletions are never missed.
        return true;
      });

      console.log("🔍 FacebookDeleteDataView - Filtering result:", {
        totalAdminRecycle: allAdminRecycle.length,
        deletedByIds: deletedByIds,
        adminIds: adminIds,
        adminIdsCount: adminIds.length,
        teamLeadIdsFromRoles: teamLeadIdsFromRoles,
        filteredCount: data.length
      });

      if (!data || data.length === 0) {
        setFacebookData([]);
        setLoading(false);
        return;
      }

      // Fetch comments for Facebook data
      const fbIds = data.map((fb: any) => fb.id);
      try {
        const { data: comments } = await (supabase
          .from("facebook_data_comments" as any)
          .select(`
            id,
            facebook_data_id,
            comment_text,
            category,
            created_at,
            user:profiles!user_id(display_name, email)
          `)
          .in("facebook_data_id", fbIds) as any);

        if (comments) {
          const commentsMap = new Map();
          comments.forEach((comment: any) => {
            if (!commentsMap.has(comment.facebook_data_id)) {
              commentsMap.set(comment.facebook_data_id, []);
            }
            commentsMap.get(comment.facebook_data_id).push(comment);
          });

          const fbWithData = data.map((fb: any) => ({
            ...fb,
            deleted_by: fb.deleted_by_id ? fb.deleted_by : null,
            comments: (commentsMap.get(fb.id) || []).sort((a: any, b: any) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
          }));

          setFacebookData(fbWithData);
        } else {
          setFacebookData(data.map((fb: any) => ({
            ...fb,
            deleted_by: fb.deleted_by_id ? fb.deleted_by : null,
            comments: []
          })));
        }
      } catch (fetchError) {
        console.warn("Could not fetch Facebook data details:", fetchError);
        setFacebookData(data.map((fb: any) => ({
          ...fb,
          deleted_by: fb.deleted_by_id ? fb.deleted_by : null,
          comments: []
        })));
      }
    } catch (error: any) {
      console.error("Error fetching deleted Facebook data:", error);
      setFacebookData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedFacebookData();

    // Listen for data update events to refresh the view
    const handleDataUpdate = () => {
      console.log("🔄 FacebookDeleteDataView - Received facebookDataUpdated event, refreshing...");
      // Add a small delay to ensure database update is committed
      setTimeout(() => {
        fetchDeletedFacebookData();
      }, 500);
    };

    window.addEventListener('facebookDataUpdated', handleDataUpdate);

    return () => {
      window.removeEventListener('facebookDataUpdated', handleDataUpdate);
    };
  }, []);

  const handleRestore = async (fbId: number) => {
    try {
      setRestoring(fbId);

      // Restore Facebook data: clear deletion_state and deleted_at
      const { error } = await (supabase
        .from("facebook_data" as any)
        .update({
          deleted_at: null,
          deleted_by_id: null,
          deletion_state: null
        })
        .eq("id", fbId) as any);

      if (error) {
        // Fallback if deletion_state column doesn't exist
        if (error.message?.includes("deletion_state")) {
          const { error: fallbackError } = await (supabase
            .from("facebook_data" as any)
            .update({
              deleted_at: null,
              deleted_by_id: null
            })
            .eq("id", fbId) as any);

          if (fallbackError) throw fallbackError;
        } else {
          throw error;
        }
      }

      toast.success("Facebook data restored successfully!");
      fetchDeletedFacebookData();

      // Dispatch event to refresh admin dashboard counts
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("facebookDataUpdated"));
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to restore Facebook data");
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async (fbId: number) => {
    if (!confirm("Are you sure you want to permanently delete this Facebook data? This action cannot be undone.")) {
      return;
    }

    try {
      setPermanentlyDeleting(fbId);

      const { error } = await (supabase
        .from("facebook_data" as any)
        .delete()
        .eq("id", fbId) as any);

      if (error) throw error;

      toast.success("Facebook data permanently deleted!");
      fetchDeletedFacebookData();

      // Dispatch event to refresh admin dashboard counts
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("facebookDataUpdated"));
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to permanently delete Facebook data");
    } finally {
      setPermanentlyDeleting(null);
    }
  };

  const filteredFacebookData = facebookData.filter((fb) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      fb.name?.toLowerCase().includes(searchLower) ||
      fb.email?.toLowerCase().includes(searchLower) ||
      fb.phone?.toLowerCase().includes(searchLower) ||
      fb.company_name?.toLowerCase().includes(searchLower) ||
      fb.owner_name?.toLowerCase().includes(searchLower) ||
      fb.deleted_by?.display_name?.toLowerCase().includes(searchLower) ||
      fb.deleted_by?.email?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading deleted Facebook data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Facebook Delete Data</h2>
        <Badge variant="secondary" className="text-sm">
          {facebookData.length} deleted {facebookData.length === 1 ? 'item' : 'items'}
        </Badge>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 text-white/80" />
          <Input
            placeholder="Search deleted Facebook data..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 text-white placeholder:text-white/60"
          />
        </div>
      </div>

      {filteredFacebookData.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Share2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm ? "No matching items found" : "No deleted Facebook data"}
            </h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Facebook data deleted by team leads will appear here"
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredFacebookData.map((fb) => (
            <FacebookDataCard
              key={fb.id}
              data={fb}
              onUpdate={fetchDeletedFacebookData}
              onRestore={() => handleRestore(fb.id)}
              onDelete={() => handlePermanentDelete(fb.id)}
              userRole="admin"
              isDeleted={true}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FacebookDeleteDataView;

