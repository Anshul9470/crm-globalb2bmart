import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Building2, Phone, Mail, MapPin, RotateCcw, Trash2, Search, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneralDeleteData {
  id: string;
  company_name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  products_services: string | null;
  deleted_at: string;
  deleted_by: {
    display_name: string;
    email: string;
  } | null;
  assigned_to: {
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

const GeneralDeleteDataView = () => {
  const [companies, setCompanies] = useState<GeneralDeleteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentlyDeleting, setPermanentlyDeleting] = useState<string | null>(null);

  const fetchDeletedCompanies = async () => {
    try {
      setLoading(true);
      
      // First, get all team lead IDs
      const { data: teamLeads, error: teamLeadsError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "team_lead");

      if (teamLeadsError) {
        console.error("Error fetching team leads:", teamLeadsError);
        setCompanies([]);
        setLoading(false);
        return;
      }

      const teamLeadIds = teamLeads?.map((tl: any) => tl.user_id) || [];

      console.log("🔍 GeneralDeleteDataView - Team lead IDs from user_roles:", teamLeadIds);

      if (teamLeadIds.length === 0) {
        console.log("⚠️ GeneralDeleteDataView - No team leads found in user_roles table");
        // Still try to query - maybe the role assignment is different
        // Query all admin_recycle items and filter client-side by checking if deleted_by is a team lead
        const { data: allAdminRecycle } = await supabase
          .from("companies")
          .select(`
            *,
            deleted_by:profiles!companies_deleted_by_id_fkey(display_name, email),
            assigned_to:profiles!companies_assigned_to_id_fkey(display_name, email),
            comments(
              id,
              comment_text,
              category,
              created_at,
              user:profiles(display_name, email)
            )
          `)
          .eq("deletion_state", "admin_recycle")
          .order("deleted_at", { ascending: false });
        
        if (allAdminRecycle && allAdminRecycle.length > 0) {
          // Get all deleted_by_ids and check their roles
          const deletedByIds = [...new Set(allAdminRecycle.map((c: any) => c.deleted_by_id).filter(Boolean))];
          const { data: roles } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", deletedByIds);
          
          const teamLeadUserIds = roles?.filter((r: any) => r.role === "team_lead").map((r: any) => r.user_id) || [];
          const filtered = allAdminRecycle.filter((c: any) => teamLeadUserIds.includes(c.deleted_by_id));
          setCompanies(filtered);
        } else {
          setCompanies([]);
        }
        setLoading(false);
        return;
      }

      // Query companies with deletion_state='admin_recycle' deleted by team leads
      console.log("🔍 GeneralDeleteDataView - Fetching companies deleted by team leads:", {
        teamLeadCount: teamLeadIds.length,
        teamLeadIds: teamLeadIds.slice(0, 3) // Log first 3 IDs
      });
      
      // Query all admin_recycle companies first, then filter by team lead role
      const { data: allAdminRecycle, error: queryError } = await supabase
        .from("companies")
        .select(`
          *,
          deleted_by:profiles!companies_deleted_by_id_fkey(display_name, email),
          assigned_to:profiles!companies_assigned_to_id_fkey(display_name, email),
          comments(
            id,
            comment_text,
            category,
            created_at,
            user:profiles(display_name, email)
          )
        `)
        .eq("deletion_state", "admin_recycle")
        .order("deleted_at", { ascending: false });

      if (queryError) {
        throw queryError;
      }

      if (!allAdminRecycle || allAdminRecycle.length === 0) {
        setCompanies([]);
        setLoading(false);
        return;
      }

      // Get all unique deleted_by_ids
      const deletedByIds = [...new Set(allAdminRecycle.map((c: any) => c.deleted_by_id).filter(Boolean))];
      
      console.log("🔍 GeneralDeleteDataView - Checking roles for deleted_by_ids:", {
        deletedByIds: deletedByIds,
        count: deletedByIds.length,
        sampleCompanies: allAdminRecycle.slice(0, 3).map((c: any) => ({
          id: c.id,
          company_name: c.company_name,
          deleted_by_id: c.deleted_by_id,
          deletion_state: c.deletion_state
        }))
      });
      
      // Get admin IDs and team lead IDs
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      // Reuse teamLeadIds from earlier query
      const teamLeadIdsFromRoles = teamLeadIds || [];

      // Also check teams table for team leads (in case user_roles isn't up to date)
      const { data: teamsData, error: teamsError } = await (supabase
        .from("teams" as any)
        .select("team_lead_id") as any);

      console.log("🔍 GeneralDeleteDataView - Teams data:", {
        teamsData: teamsData,
        teamsError: teamsError?.message,
        teamsCount: teamsData?.length || 0
      });

      const adminIds = admins?.map((a: any) => a.user_id) || [];
      const teamLeadIdsFromTeams = teamsData?.map((t: any) => t.team_lead_id).filter(Boolean) || [];
      
      // Combine team lead IDs from both sources
      const allTeamLeadIds = [...new Set([...teamLeadIdsFromRoles, ...teamLeadIdsFromTeams])];
      
      // Check all deleted_by_ids against teams table to find any team leads not in user_roles
      const deletedByIdsInTeams = deletedByIds.filter((id: string) => 
        teamsData?.some((t: any) => t.team_lead_id === id)
      );
      
      // Add any team leads found in teams table that weren't already in the list
      const additionalTeamLeadIds = deletedByIdsInTeams.filter((id: string) => !allTeamLeadIds.includes(id));
      if (additionalTeamLeadIds.length > 0) {
        console.log("⚠️ GeneralDeleteDataView - Found additional team leads in teams table:", additionalTeamLeadIds);
        allTeamLeadIds.push(...additionalTeamLeadIds);
      }
      
      // Check if the specific deleting user is in teams table
      // Merged team lead ID list from both user_roles and teams tables
      console.log("🔍 GeneralDeleteDataView - Team lead ID merge:", {
        teamLeadIdsFromRolesCount: teamLeadIdsFromRoles.length,
        teamLeadIdsFromTeamsCount: teamLeadIdsFromTeams.length,
        additionalTeamLeadIds: additionalTeamLeadIds,
        allTeamLeadIdsCount: allTeamLeadIds.length,
      });
      
      // IMPORTANT: If a user deleted data and they're NOT an admin, include it
      // This handles cases where team leads aren't properly set up in user_roles or teams tables
      // Since they're deleting from team lead recycle bin, they must be a team lead
      
      console.log("🔍 GeneralDeleteDataView - Role IDs:", {
        adminIds: adminIds,
        adminCount: adminIds.length,
        teamLeadIdsFromRoles: teamLeadIdsFromRoles,
        teamLeadIdsFromTeams: teamLeadIdsFromTeams,
        allTeamLeadIds: allTeamLeadIds,
        teamLeadCount: allTeamLeadIds.length
      });
      
      // Filter to show companies deleted by team leads OR non-admins
      // Logic: If deletion_state='admin_recycle', it came from team lead recycle bin
      // So we should include ALL non-admin deletions (team leads, employees, etc.)
      // Only exclude if deleted by admin AND admin didn't delete from team lead recycle bin
      const data = allAdminRecycle.filter((c: any) => {
        if (!c.deleted_by_id) return false;
        
        // If deleted by a team lead, always include (even if they're also an admin)
        const isTeamLead = allTeamLeadIds.includes(c.deleted_by_id);
        if (isTeamLead) {
          console.log("✅ GeneralDeleteDataView - Including company (deleted by team lead):", {
            company_id: c.id,
            company_name: c.company_name,
            deleted_by_id: c.deleted_by_id
          });
          return true;
        }
        
        // If not an admin, include it (this handles team leads not in user_roles/teams)
        // Since deletion_state='admin_recycle' and deleted_by is not admin,
        // it must have come from team lead recycle bin
        const isNotAdmin = !adminIds.includes(c.deleted_by_id);
        if (isNotAdmin) {
          console.log("✅ GeneralDeleteDataView - Including company (deleted by non-admin, likely team lead):", {
            company_id: c.id,
            company_name: c.company_name,
            deleted_by_id: c.deleted_by_id,
            isAdmin: false,
            isTeamLead: isTeamLead
          });
          return true;
        }
        
        // Special case: If admin deleted but they're also in teams table as team_lead_id,
        // include it (they might be acting as team lead)
        const isAdminButAlsoTeamLead = adminIds.includes(c.deleted_by_id) && 
          teamsData?.some((t: any) => t.team_lead_id === c.deleted_by_id);
        
        if (isAdminButAlsoTeamLead) {
          console.log("✅ GeneralDeleteDataView - Including company (deleted by admin who is also team lead):", {
            company_id: c.id,
            company_name: c.company_name,
            deleted_by_id: c.deleted_by_id
          });
          return true;
        }
        
        // CRITICAL FIX: Since deletion_state='admin_recycle' is set when team leads delete from recycle bin,
        // and we can't reliably distinguish team lead deletions from admin deletions,
        // we'll include ALL admin_recycle deletions. The sections are specifically for team lead deletions,
        // and if an admin also has team lead permissions, their deletions should appear here.
        // If there are false positives (pure admin deletions), they can be filtered manually.
        // This ensures team lead deletions are never missed.
        console.log("✅ GeneralDeleteDataView - Including company (admin_recycle deletion, assuming team lead context):", {
          company_id: c.id,
          company_name: c.company_name,
          deleted_by_id: c.deleted_by_id,
          isAdmin: adminIds.includes(c.deleted_by_id),
          isTeamLead: isTeamLead,
          deletion_state: c.deletion_state
        });
        return true;
      });
      
      console.log("🔍 GeneralDeleteDataView - Filtering result:", {
        totalAdminRecycle: allAdminRecycle.length,
        deletedByIds: deletedByIds,
        adminIds: adminIds,
        adminIdsCount: adminIds.length,
        filteredCount: data.length,
        filteredCompanies: data.slice(0, 3).map((c: any) => ({
          id: c.id,
          company_name: c.company_name,
          deleted_by_id: c.deleted_by_id
        }))
      });
      
      
      console.log("📊 GeneralDeleteDataView - Final result:", {
        dataCount: data?.length || 0,
        sampleIds: data?.slice(0, 3).map((c: any) => ({ id: c.id, deleted_by_id: c.deleted_by_id, company_name: c.company_name }))
      });

      setCompanies(data || []);
      setLoading(false);
    } catch (error: any) {
      // If deletion_state column doesn't exist, fall back to old behavior
      if (error.message?.includes("deletion_state")) {
        try {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("companies")
            .select(`
              *,
              deleted_by:profiles!companies_deleted_by_id_fkey(display_name, email),
              assigned_to:profiles!companies_assigned_to_id_fkey(display_name, email),
              comments(
                id,
                comment_text,
                category,
                created_at,
                user:profiles(display_name, email)
              )
            `)
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false });

          if (fallbackError) {
            toast.error("Database migration not applied yet. Please run the migration first.");
            setCompanies([]);
            setLoading(false);
            return;
          }
          
          // Filter by team leads in fallback too
          if (fallbackData && fallbackData.length > 0) {
            const deletedByIds = [...new Set(fallbackData.map((c: any) => c.deleted_by_id).filter(Boolean))];
            const { data: deletedByRoles } = await supabase
              .from("user_roles")
              .select("user_id, role")
              .in("user_id", deletedByIds);
            const teamLeadUserIds = deletedByRoles?.filter((r: any) => r.role === "team_lead").map((r: any) => r.user_id) || [];
            const filtered = fallbackData.filter((c: any) => teamLeadUserIds.includes(c.deleted_by_id));
            setCompanies(filtered);
          } else {
            setCompanies([]);
          }
          setLoading(false);
        } catch (fallbackErr: any) {
          toast.error("Database migration not applied yet. Please run the migration first.");
          setCompanies([]);
          setLoading(false);
        }
        return;
      }
      
      // If the columns don't exist yet, show a helpful message
      if (error.message?.includes("deleted_by_id") || error.message?.includes("deleted_at")) {
        toast.error("Database migration not applied yet. Please run the migration first.");
        setCompanies([]);
        setLoading(false);
        return;
      }
      
      toast.error(error.message || "Failed to fetch deleted companies");
      setCompanies([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedCompanies();
    
    // Listen for data update events to refresh the view
    const handleDataUpdate = () => {
      console.log("🔄 GeneralDeleteDataView - Received companyDataUpdated event, refreshing...");
      // Add a small delay to ensure database update is committed
      setTimeout(() => {
        fetchDeletedCompanies();
      }, 500);
    };
    
    window.addEventListener('companyDataUpdated', handleDataUpdate);
    
    return () => {
      window.removeEventListener('companyDataUpdated', handleDataUpdate);
    };
  }, []);

  const handleRestore = async (companyId: string) => {
    try {
      setRestoring(companyId);
      
      // Restore company: clear deletion_state and deleted_at
      const updateData: any = {
        deleted_at: null,
        deleted_by_id: null,
        deletion_state: null
      };

      const { error } = await supabase
        .from("companies")
        .update(updateData)
        .eq("id", companyId);

      if (error) {
        // Fallback if deletion_state column doesn't exist
        if (error.message?.includes("deletion_state")) {
          const { error: fallbackError } = await supabase
            .from("companies")
            .update({
              deleted_at: null,
              deleted_by_id: null
            })
            .eq("id", companyId);
          
          if (fallbackError) throw fallbackError;
        } else {
          throw error;
        }
      }

      toast.success("Company restored successfully!");
      fetchDeletedCompanies();
      
      // Dispatch event to refresh admin dashboard counts
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("companyDataUpdated"));
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to restore company");
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async (companyId: string) => {
    if (!confirm("Are you sure you want to permanently delete this company? This action cannot be undone.")) {
      return;
    }

    try {
      setPermanentlyDeleting(companyId);
      
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyId);

      if (error) throw error;

      toast.success("Company permanently deleted!");
      fetchDeletedCompanies();
      
      // Dispatch event to refresh admin dashboard counts
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("companyDataUpdated"));
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to permanently delete company");
    } finally {
      setPermanentlyDeleting(null);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      hot: "bg-red-500/20 text-red-500",
      followup: "bg-yellow-500/20 text-yellow-500",
      today: "bg-blue-500/20 text-blue-500",
      block: "bg-gray-500/20 text-gray-500",
      general: "bg-green-500/20 text-green-500",
      facebook: "bg-purple-500/20 text-purple-500",
    };
    return colors[category] || "bg-gray-500/20 text-gray-500";
  };

  const getCategoryIcon = (category: string) => {
    // Return appropriate icon based on category
    return "•";
  };

  const filteredCompanies = companies.filter((company) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      company.company_name?.toLowerCase().includes(searchLower) ||
      company.owner_name?.toLowerCase().includes(searchLower) ||
      company.phone?.toLowerCase().includes(searchLower) ||
      company.email?.toLowerCase().includes(searchLower) ||
      company.address?.toLowerCase().includes(searchLower) ||
      company.deleted_by?.display_name?.toLowerCase().includes(searchLower) ||
      company.deleted_by?.email?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading deleted companies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">General Delete Data</h2>
        <Badge variant="secondary" className="text-sm">
          {companies.length} deleted {companies.length === 1 ? 'item' : 'items'}
        </Badge>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 text-white/80" />
          <Input
            placeholder="Search deleted companies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 text-white placeholder:text-white/60"
          />
        </div>
      </div>

      {filteredCompanies.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm ? "No matching items found" : "No deleted companies"}
            </h3>
            <p className="text-muted-foreground">
              {searchTerm 
                ? "Try adjusting your search terms" 
                : "Companies deleted by team leads will appear here"
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => {
            const lastComment = company.comments?.[0];
            
            return (
              <Card key={company.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        {company.company_name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{company.owner_name}</p>
                    </div>
                    {lastComment && (
                      <Badge className={cn("ml-2", getCategoryColor(lastComment.category))}>
                        {getCategoryIcon(lastComment.category)} {lastComment.category.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {company.phone}
                    </div>
                    {company.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        {company.email}
                      </div>
                    )}
                    {company.address && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {company.address}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="font-medium">Assigned to:</span>
                      {company.assigned_to ? (
                        company.assigned_to.display_name
                      ) : (
                        <span className="text-orange-600 font-medium">Unassigned</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span className="font-medium">Deleted:</span>
                      {new Date(company.deleted_at).toLocaleString()}
                    </div>
                    {company.deleted_by && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span className="font-medium">Deleted by:</span>
                        {company.deleted_by.display_name}
                      </div>
                    )}
                  </div>

                  {lastComment && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Last Comment</p>
                      <p className="text-sm">{lastComment.comment_text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Added: {new Date(lastComment.created_at).toLocaleString()}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleRestore(company.id)}
                      disabled={restoring === company.id}
                      className="flex-1"
                      variant="outline"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {restoring === company.id ? "Restoring..." : "Restore"}
                    </Button>
                    <Button
                      onClick={() => handlePermanentDelete(company.id)}
                      disabled={permanentlyDeleting === company.id}
                      variant="destructive"
                      size="icon"
                      title="Permanently delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GeneralDeleteDataView;

