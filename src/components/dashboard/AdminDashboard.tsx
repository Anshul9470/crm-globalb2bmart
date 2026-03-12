import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Building2,
  Plus,
  MessageSquare,
  CalendarDays,
  Settings,
  UserCog,
  Trash2,
  Share2,
  Pencil,
  LogIn,
  ArrowLeft,
  FileCheck,
  DollarSign,
  Search,
  ShieldCheck,
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import AllCompaniesView from "./views/AllCompaniesView";
import EmployeeManagementView from "./views/EmployeeManagementView";
import TeamCreationView from "./views/TeamCreationView";
import DataRequestsView from "./views/DataRequestsView";
import EditRequestsView from "./views/EditRequestsView";
import HolidaysView from "./views/HolidaysView";
import AddNewDataView from "./views/AddNewDataView";
import AdminDataAssignmentView from "./views/AdminDataAssignmentView";
import FacebookDataView from "./views/FacebookDataView";
import RecycleBinView from "./views/RecycleBinView";
import UserImpersonationView from "./views/UserImpersonationView";
import EmployeeDashboard from "./EmployeeDashboard";
import TeamLeadDashboard from "./TeamLeadDashboard";
import CompanyApprovalView from "./views/CompanyApprovalView";
import PaidClientPoolView from "./views/PaidClientPoolView";
import FacebookDeleteDataView from "./views/FacebookDeleteDataView";
import GeneralDeleteDataView from "./views/GeneralDeleteDataView";
import SearchDataView from "./views/SearchDataView";
import AdminTeamManagementView from "./views/AdminTeamManagementView";
import LoginApprovalView from "./views/LoginApprovalView";
import { Button } from "@/components/ui/button";

interface AdminDashboardProps {
  user: User;
}

const AdminDashboard = ({ user }: AdminDashboardProps) => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState("companies");
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [userName, setUserName] = useState<string>("");
  const [impersonatedUser, setImpersonatedUser] = useState<{
    id: string;
    role: "employee" | "team_lead";
    name: string;
    email: string;
  } | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  const fetchCategoryCounts = async () => {
    try {
      // Fetch all counts in parallel for faster loading
      // First, get all team lead IDs for filtering delete data
      const { data: teamLeads } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "team_lead");

      const teamLeadIds = teamLeads?.map((tl: any) => tl.user_id) || [];

      const [
        companiesResult,
        facebookResult,
        dataRequestsResult,
        editRequestsResult,
        recycleResult,
        approvalsResult,
        paidClientsResult,
        facebookDeleteResult,
        generalDeleteResult
      ] = await Promise.all([
        supabase
          .from("companies")
          .select("*", { count: "exact", head: true })
          .eq("approval_status", "approved")
          .is("deleted_at", null),
        supabase
          .from("facebook_data" as any)
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("deletion_state", null) as any,
        supabase
          .from("data_requests")
          .select("*", { count: "exact", head: true }),
        supabase
          .from("facebook_data_edit_requests" as any)
          .select("*", { count: "exact", head: true })
          .eq("status", "pending") as any,
        // Recycle bin count removed - using specialized delete sections instead
        Promise.resolve({ count: 0 }),
        supabase
          .from("companies" as any)
          .select("*", { count: "exact", head: true })
          .or('approval_status.eq.pending,approval_status.is.null')
          .is("deleted_at", null) as any,
        // Fetch paid clients count (companies with is_paid = true)
        supabase
          .from("companies" as any)
          .select("*", { count: "exact", head: true })
          .eq("is_paid", true)
          .is("deleted_at", null) as any,
        // Fetch Facebook delete data count (only items deleted by team leads)
        // Match the exact filtering logic from FacebookDeleteDataView
        (async () => {
          // Get all admin_recycle Facebook data
          const { data: allAdminRecycle } = await (supabase
            .from("facebook_data" as any)
            .select("id, deleted_by_id")
            .eq("deletion_state", "admin_recycle") as any);

          if (!allAdminRecycle || allAdminRecycle.length === 0) {
            return { count: 0 };
          }

          // Get admin IDs and team lead IDs (matching FacebookDeleteDataView logic)
          const [adminsResult, teamLeadsResult, teamsResult] = await Promise.all([
            supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin"),
            supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "team_lead"),
            supabase
              .from("teams" as any)
              .select("team_lead_id") as any
          ]);

          const adminIds = adminsResult.data?.map((a: any) => a.user_id) || [];
          const teamLeadIdsFromRoles = teamLeadsResult.data?.map((tl: any) => tl.user_id) || [];
          const teamLeadIdsFromTeams = teamsResult.data?.map((t: any) => t.team_lead_id).filter(Boolean) || [];

          // Combine team lead IDs from both sources
          let allTeamLeadIds = [...new Set([...teamLeadIdsFromRoles, ...teamLeadIdsFromTeams])];

          // Check deleted_by_ids against teams table to find any team leads not in user_roles
          const deletedByIds = [...new Set(allAdminRecycle.map((fb: any) => fb.deleted_by_id).filter(Boolean))];
          const deletedByIdsInTeams = deletedByIds.filter((id: string) =>
            teamsResult.data?.some((t: any) => t.team_lead_id === id)
          );

          // Add any team leads found in teams table that weren't already in the list
          const additionalTeamLeadIds = deletedByIdsInTeams.filter((id: string) => !allTeamLeadIds.includes(id));
          if (additionalTeamLeadIds.length > 0) {
            allTeamLeadIds.push(...additionalTeamLeadIds);
          }

          // Filter to match FacebookDeleteDataView logic: only items deleted by team leads or non-admins
          const filteredData = allAdminRecycle.filter((fb: any) => {
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

            // Special case: If admin deleted but they're also in teams table as team_lead_id
            const isAdminButAlsoTeamLead = adminIds.includes(fb.deleted_by_id) &&
              teamsResult.data?.some((t: any) => t.team_lead_id === fb.deleted_by_id);

            if (isAdminButAlsoTeamLead) {
              return true;
            }

            // Include ALL admin_recycle deletions (matching FacebookDeleteDataView line 162)
            return true;
          });

          return { count: filteredData.length };
        })(),
        // Fetch General delete data count (only items deleted by team leads)
        // Match the exact filtering logic from GeneralDeleteDataView
        (async () => {
          // Get all admin_recycle companies
          const { data: allAdminRecycle } = await supabase
            .from("companies")
            .select("id, deleted_by_id")
            .eq("deletion_state", "admin_recycle");

          if (!allAdminRecycle || allAdminRecycle.length === 0) {
            return { count: 0 };
          }

          // Get admin IDs and team lead IDs (matching GeneralDeleteDataView logic)
          const [teamLeadsResult, adminsResult, teamsResult] = await Promise.all([
            supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "team_lead"),
            supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin"),
            supabase
              .from("teams" as any)
              .select("team_lead_id") as any
          ]);

          const teamLeadIdsFromRoles = teamLeadsResult.data?.map((tl: any) => tl.user_id) || [];
          const adminIds = adminsResult.data?.map((a: any) => a.user_id) || [];
          const teamLeadIdsFromTeams = teamsResult.data?.map((t: any) => t.team_lead_id).filter(Boolean) || [];

          // Combine team lead IDs from both sources
          let allTeamLeadIds = [...new Set([...teamLeadIdsFromRoles, ...teamLeadIdsFromTeams])];

          // Check deleted_by_ids against teams table to find any team leads not in user_roles
          const deletedByIds = [...new Set(allAdminRecycle.map((c: any) => c.deleted_by_id).filter(Boolean))];
          const deletedByIdsInTeams = deletedByIds.filter((id: string) =>
            teamsResult.data?.some((t: any) => t.team_lead_id === id)
          );

          // Add any team leads found in teams table that weren't already in the list
          const additionalTeamLeadIds = deletedByIdsInTeams.filter((id: string) => !allTeamLeadIds.includes(id));
          if (additionalTeamLeadIds.length > 0) {
            allTeamLeadIds.push(...additionalTeamLeadIds);
          }

          // Filter to match GeneralDeleteDataView logic (lines 230-288)
          const filteredData = allAdminRecycle.filter((c: any) => {
            // Filter out items without deleted_by_id (matching line 231)
            if (!c.deleted_by_id) return false;

            // If deleted by a team lead, always include (even if they're also an admin) - line 234-241
            const isTeamLead = allTeamLeadIds.includes(c.deleted_by_id);
            if (isTeamLead) {
              return true;
            }

            // If not an admin, include it (this handles team leads not in user_roles/teams) - line 244-257
            const isNotAdmin = !adminIds.includes(c.deleted_by_id);
            if (isNotAdmin) {
              return true;
            }

            // Special case: If admin deleted but they're also in teams table as team_lead_id - line 259-271
            const isAdminButAlsoTeamLead = adminIds.includes(c.deleted_by_id) &&
              teamsResult.data?.some((t: any) => t.team_lead_id === c.deleted_by_id);

            if (isAdminButAlsoTeamLead) {
              return true;
            }

            // Include ALL admin_recycle deletions (matching GeneralDeleteDataView line 287)
            return true;
          });

          return { count: filteredData.length };
        })()
      ]);

      // Compute login approvals count: pending, non-admin users only
      let loginApprovalsCount = 0;
      try {
        const { data: approvals } = await supabase
          .from("login_approvals" as any)
          .select("id, user_id, status, requested_at")
          .order("requested_at", { ascending: false });

        const approvalsData = approvals || [];
        if (approvalsData.length > 0) {
          const userIds = Array.from(new Set(approvalsData.map((a: any) => a.user_id)));
          const { data: roles } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", userIds);

          const rolesByUserId = (roles || []).reduce((acc: any, row: any) => {
            acc[row.user_id] = row.role;
            return acc;
          }, {} as Record<string, string>);

          // For each non-admin user, only consider the latest request
          const latestByUser: Record<string, any> = {};
          for (const a of approvalsData) {
            if (rolesByUserId[a.user_id] === "admin") continue;
            const existing = latestByUser[a.user_id];
            if (!existing) {
              latestByUser[a.user_id] = a;
            } else if (new Date(a.requested_at).getTime() > new Date(existing.requested_at).getTime()) {
              latestByUser[a.user_id] = a;
            }
          }

          loginApprovalsCount = Object.values(latestByUser).filter(
            (a: any) => a.status === "pending"
          ).length;
        }
      } catch {
        loginApprovalsCount = 0;
      }

      const counts: Record<string, number> = {
        companies: (companiesResult.count || 0) + (facebookResult.count || 0),
        facebook: facebookResult.count || 0,
        requests: dataRequestsResult.count || 0,
        "edit-requests": editRequestsResult.count || 0,
        approvals: approvalsResult.count || 0,
        "paid-clients": paidClientsResult.count || 0,
        "facebook-delete": facebookDeleteResult.count || 0,
        "general-delete": generalDeleteResult.count || 0,
        "login-approvals": loginApprovalsCount,
      };

      setCategoryCounts(counts);
    } catch (error) {
      console.error("Error fetching category counts:", error);
      // Set defaults on error so dashboard still renders
      setCategoryCounts({
        companies: 0,
        facebook: 0,
        requests: 0,
        "edit-requests": 0,
        approvals: 0,
        "paid-clients": 0,
        "facebook-delete": 0,
        "general-delete": 0,
        "login-approvals": 0,
      });
    }
  };

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    // Load counts asynchronously without blocking render
    fetchCategoryCounts();

    // Refresh counts periodically (only when tab is visible)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMounted) {
        fetchCategoryCounts();
      }
    };

    // Refresh counts every 30 seconds when visible
    intervalId = setInterval(() => {
      if (document.visibilityState === "visible" && isMounted) {
        fetchCategoryCounts();
      }
    }, 30000);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch user's display name
  useEffect(() => {
    const fetchUserName = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      if (profile?.display_name) {
        setUserName(profile.display_name);
      } else {
        setUserName(user.email?.split("@")[0] || "Admin");
      }
    };

    fetchUserName();
  }, [user.id, user.email]);

  // Listen for data update events
  useEffect(() => {
    const handleDataUpdate = () => {
      fetchCategoryCounts();
    };

    window.addEventListener('facebookDataUpdated', handleDataUpdate);
    window.addEventListener('companyDataUpdated', handleDataUpdate);
    window.addEventListener('loginApprovalsUpdated', handleDataUpdate);

    return () => {
      window.removeEventListener('facebookDataUpdated', handleDataUpdate);
      window.removeEventListener('companyDataUpdated', handleDataUpdate);
      window.removeEventListener('loginApprovalsUpdated', handleDataUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginAsUser = async (userId: string, userRole: "employee" | "team_lead", userName: string) => {
    // Fetch the user profile to create a mock User object
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!profile) {
      toast.error("User profile not found");
      return;
    }

    setImpersonatedUser({
      id: userId,
      role: userRole,
      name: userName,
      email: profile.email || "",
    });
    setCurrentView(""); // Clear current view when impersonating
  };

  const handleReturnToAdmin = () => {
    setImpersonatedUser(null);
    setCurrentView("companies");
    toast.success("Returned to Admin Dashboard");
  };

  const menuItems = [
    { id: "companies", label: "All Companies", icon: Building2, count: categoryCounts.companies },
    { id: "add", label: "Add Company", icon: Plus },
    { id: "approvals", label: "Company Approvals", icon: FileCheck, count: categoryCounts.approvals },
    { id: "login-approvals", label: "Login Approvals", icon: ShieldCheck, count: categoryCounts["login-approvals"] },
    { id: "assign", label: "Assign Data", icon: UserCog },
    { id: "facebook", label: "Facebook Data", icon: Share2, count: categoryCounts.facebook },
    { id: "search", label: "Search Data", icon: Search },
    { id: "paid-clients", label: "Paid Client Pool", icon: DollarSign, count: categoryCounts["paid-clients"] },
    { id: "employees", label: "Employee Management", icon: Users },
    { id: "team-management", label: "Team Management", icon: Users },
    { id: "teams", label: "Team Creation", icon: UserPlus },
    { id: "view-users", label: "View Users", icon: LogIn },
    { id: "requests", label: "Data Requests", icon: MessageSquare, count: categoryCounts.requests },
    { id: "edit-requests", label: "Edit Requests", icon: Pencil, count: categoryCounts["edit-requests"] },
    { id: "holidays", label: "Holidays", icon: CalendarDays },
    { id: "facebook-delete", label: "Facebook Delete Data", icon: Share2, count: categoryCounts["facebook-delete"] },
    { id: "general-delete", label: "General Delete Data", icon: Building2, count: categoryCounts["general-delete"] },
  ];

  // If impersonating, show the appropriate dashboard
  if (impersonatedUser) {
    // Create a mock User object for the impersonated user
    const mockUser: User = {
      id: impersonatedUser.id,
      email: impersonatedUser.email,
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      confirmation_sent_at: null,
      recovery_sent_at: null,
      email_confirmed_at: null,
      invited_at: null,
      action_link: "",
      phone: null,
      confirmed_at: null,
      last_sign_in_at: null,
      role: "",
      updated_at: new Date().toISOString(),
    };

    return (
      <div className="min-h-screen bg-background">
        {/* Return to Admin Banner */}
        <div className="bg-primary/10 border-b border-primary/20 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 rounded-full p-2">
              <LogIn className="h-4 w-4 text-primary text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground ">
                Viewing as: <span className="text-primary text-white">{impersonatedUser.name}</span>
              </p>
              <p className="text-xs text-muted-foreground text-white">
                {impersonatedUser.role === "employee" ? "Employee Dashboard" : "Team Lead Dashboard"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReturnToAdmin}
            className="flex items-center gap-2 text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Admin
          </Button>
        </div>

        {/* Render the appropriate dashboard */}
        {impersonatedUser.role === "employee" ? (
          <EmployeeDashboard user={mockUser} />
        ) : (
          <TeamLeadDashboard user={mockUser} />
        )}
      </div>
    );
  }

  return (
    <DashboardLayout
      menuItems={menuItems}
      currentView={currentView}
      onViewChange={setCurrentView}
      user={user}
      userName={userName}
      onLogout={handleLogout}
    >
      {currentView === "companies" && <AllCompaniesView userRole="admin" />}
      {currentView === "add" && <AddNewDataView userId={user.id} userRole="admin" />}
      {currentView === "approvals" && <CompanyApprovalView />}
      {currentView === "login-approvals" && <LoginApprovalView />}
      {currentView === "assign" && <AdminDataAssignmentView />}
      {currentView === "facebook" && <FacebookDataView userId={user.id} userRole="admin" />}
      {currentView === "search" && <SearchDataView />}
      {currentView === "paid-clients" && <PaidClientPoolView userRole="admin" />}
      {currentView === "employees" && <EmployeeManagementView />}
      {currentView === "team-management" && <AdminTeamManagementView />}
      {currentView === "teams" && <TeamCreationView />}
      {currentView === "view-users" && (
        <UserImpersonationView onLoginAsUser={handleLoginAsUser} />
      )}
      {currentView === "requests" && <DataRequestsView />}
      {currentView === "edit-requests" && <EditRequestsView />}
      {currentView === "holidays" && <HolidaysView />}
      {currentView === "facebook-delete" && <FacebookDeleteDataView />}
      {currentView === "general-delete" && <GeneralDeleteDataView />}
    </DashboardLayout>
  );
};

export default AdminDashboard;
