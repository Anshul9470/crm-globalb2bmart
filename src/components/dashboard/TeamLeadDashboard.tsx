import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Calendar,
  TrendingUp,
  Flame,
  Ban,
  Database,
  Plus,
  MessageSquarePlus,
  UserPlus,
  BarChart3,
  Trash2,
  LogIn,
  ArrowLeft,
  Search,
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import AssignedDataView from "./views/AssignedDataView";
import TodayDataView from "./views/TodayDataView";
import FollowUpDataView from "./views/FollowUpDataView";
import HotDataView from "./views/HotDataView";
import BlockDataView from "./views/BlockDataView";
import GeneralDataView from "./views/GeneralDataView";
import AddNewDataView from "./views/AddNewDataView";
import RequestDataView from "./views/RequestDataView";
import DataAssignmentView from "./views/DataAssignmentView";
import EmployeeDataOverviewView from "./views/EmployeeDataOverviewView";
import RecycleBinView from "./views/RecycleBinView";
import TeamLeadEmployeeView from "./views/TeamLeadEmployeeView";
import EmployeeDashboard from "./EmployeeDashboard";
import SearchDataView from "./views/SearchDataView";
import { Button } from "@/components/ui/button";

interface TeamLeadDashboardProps {
  user: User;
}

const TeamLeadDashboard = ({ user }: TeamLeadDashboardProps) => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState("assigned");
  const [impersonatedUser, setImpersonatedUser] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [userName, setUserName] = useState<string>("");

  const fetchCategoryCounts = async () => {
    try {
      const counts: Record<string, number> = {};

      // Fetch assigned companies count (without comments, within 24 hours)
      const { data: assignedCompanies } = await supabase
        .from("companies")
        .select(`
          id,
          assigned_at,
          comments (id)
        `)
        .eq("assigned_to_id", user.id)
        .is("deleted_at", null);

      if (assignedCompanies) {
        const now = Date.now();
        const assignedCount = assignedCompanies.filter((company: any) => {
          if (!company.assigned_at) return false;
          const assignedAt = new Date(company.assigned_at).getTime();
          const hoursSinceAssignment = (now - assignedAt) / (1000 * 60 * 60);
          if (hoursSinceAssignment >= 24) return false;
          // Only count companies without comments
          return !company.comments || company.comments.length === 0;
        }).length;
        counts.assigned = assignedCount;
      }

      // Fetch today data count (companies with comments from today)
      const today = new Date().toISOString().split("T")[0];

      const { data: todayCompanies } = await supabase
        .from("companies")
        .select(`
          id,
          comments (id, created_at)
        `)
        .eq("assigned_to_id", user.id)
        .is("deleted_at", null);

      let todayCount = 0;
      if (todayCompanies) {
        const todayCompaniesCount = todayCompanies.filter((company: any) => {
          if (!company.comments || company.comments.length === 0) return false;
          return company.comments.some((comment: any) =>
            comment.created_at.startsWith(today)
          );
        }).length;
        todayCount += todayCompaniesCount;
      }
      counts.today = todayCount;

      // Fetch category counts (companies with latest comment in each category)
      // Note: Handle "block" (Inactive Pool) separately to mirror BlockDataView filtering
      const categories = ["follow_up", "hot", "general"];

      for (const category of categories) {
        let categoryCount = 0;

        const { data: categoryCompanies } = await supabase
          .from("companies")
          .select(`
            id,
            comments (id, category, created_at)
          `)
          .eq("assigned_to_id", user.id)
          .is("deleted_at", null);

        if (categoryCompanies) {
          const categoryCompaniesCount = categoryCompanies.filter((company: any) => {
            if (!company.comments || company.comments.length === 0) return false;
            const sortedComments = [...company.comments].sort(
              (a: any, b: any) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
            const latestComment = sortedComments[0];
            return latestComment && latestComment.category === category;
          }).length;
          categoryCount += categoryCompaniesCount;
        }

        const categoryMap: Record<string, string> = {
          follow_up: "followup",
          hot: "hot",
          general: "general",
        };
        counts[categoryMap[category]] = categoryCount;
      }

      // --- Block / Inactive Pool count (matches BlockDataView filtering) ---
      let blockCount = 0;

      // Companies in inactive pool
      const { data: blockCompanies } = await supabase
        .from("companies")
        .select(`
          id,
          deletion_state,
          comments (id, category, created_at)
        `)
        .eq("assigned_to_id", user.id)
        .is("deleted_at", null);

      if (blockCompanies) {
        blockCount += blockCompanies.filter((company: any) => {
          const deletionState = (company as any).deletion_state;

          // Exclude items moved to recycle bins
          if (deletionState === "team_lead_recycle" || deletionState === "admin_recycle") return false;

          // Show items with deletion_state='inactive'
          if (deletionState === "inactive") return true;

          // If other deletion_state values exist, exclude
          if (deletionState) return false;

          // Otherwise, check latest comment for block
          if (!company.comments || company.comments.length === 0) return false;
          const sortedComments = [...company.comments].sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          const latestComment = sortedComments[0];
          return latestComment && latestComment.category === "block";
        }).length;
      }

      // Facebook data in inactive pool
      const { data: fbShares } = await (supabase
        .from("facebook_data_shares" as any)
        .select("facebook_data_id, employee_id, created_at")
        .eq("employee_id", user.id) as any);

      if (fbShares && fbShares.length > 0) {
        const fbIds = fbShares.map((s: any) => s.facebook_data_id);

        const { data: fbData } = await (supabase
          .from("facebook_data" as any)
          .select(`
            id,
            deletion_state
          `)
          .in("id", fbIds) as any);

        let commentsMap = new Map();
        const { data: fbComments } = await (supabase
          .from("facebook_data_comments" as any)
          .select("id, facebook_data_id, category, created_at")
          .in("facebook_data_id", fbIds) as any);

        if (fbComments) {
          fbComments.forEach((comment: any) => {
            if (!commentsMap.has(comment.facebook_data_id)) {
              commentsMap.set(comment.facebook_data_id, []);
            }
            commentsMap.get(comment.facebook_data_id).push(comment);
          });
        }

        if (fbData) {
          blockCount += fbData.filter((fb: any) => {
            const deletionState = fb.deletion_state;

            // Exclude items moved to recycle bins
            if (deletionState === "team_lead_recycle" || deletionState === "admin_recycle") return false;

            // Show items with deletion_state='inactive'
            if (deletionState === "inactive") return true;

            // If other deletion_state values exist, exclude
            if (deletionState) return false;

            // Otherwise, check latest comment for block
            const fbCommentList = commentsMap.get(fb.id) || [];
            if (fbCommentList.length === 0) return false;
            const sortedComments = [...fbCommentList].sort(
              (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            const latestComment = sortedComments[0];
            return latestComment && latestComment.category === "block";
          }).length;
        }
      }

      counts.block = blockCount;

      setCategoryCounts(counts);
    } catch (error) {
      console.error("Error fetching team lead category counts:", error);
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
  }, [user.id]);

  useEffect(() => {
    const handleDataUpdate = () => {
      fetchCategoryCounts();
    };

    window.addEventListener("companyDataUpdated", handleDataUpdate);

    return () => {
      window.removeEventListener("companyDataUpdated", handleDataUpdate);
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
        setUserName(user.email?.split("@")[0] || "Team Lead");
      }
    };
    
    fetchUserName();
  }, [user.id, user.email]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  const handleLoginAsUser = async (userId: string, userName: string) => {
    // Fetch the user profile to get email
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
      name: userName,
      email: profile.email || "",
    });
    setCurrentView(""); // Clear current view when impersonating
  };

  const handleReturnToTeamLead = () => {
    setImpersonatedUser(null);
    setCurrentView("assigned");
    toast.success("Returned to Team Lead Dashboard");
  };

  const menuItems = [
    { id: "assigned", label: "Assigned Data", icon: LayoutDashboard, count: categoryCounts.assigned },
    { id: "search", label: "Search Data", icon: Search },
    { id: "today", label: "Today Data", icon: Calendar, count: categoryCounts.today },
    { id: "followup", label: "Active Pool", icon: TrendingUp, count: categoryCounts.followup },
    { id: "hot", label: "Prime Pool", icon: Flame, count: categoryCounts.hot },
    { id: "block", label: "Inactive Pool", icon: Ban, count: categoryCounts.block },
    { id: "general", label: "General Data", icon: Database, count: categoryCounts.general },
    { id: "add", label: "Add New Data", icon: Plus },
    { id: "request", label: "Request Data", icon: MessageSquarePlus },
    { id: "assign", label: "Assign Data", icon: UserPlus },
    { id: "view-employees", label: "View Employees", icon: LogIn },
    { id: "overview", label: "Data Overview", icon: BarChart3 },
    { id: "recycle", label: "Recycle Bin", icon: Trash2 },
  ];

  // If impersonating, show the employee dashboard
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
        {/* Return to Team Lead Banner */}
        <div className="bg-primary/10 border-b border-primary/20 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 rounded-full p-2">
              <LogIn className="h-4 w-4 text-primary text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Viewing as: <span className="text-primary text-white">{impersonatedUser.name}</span>
              </p>
              <p className="text-xs text-muted-foreground text-white/80">
                Employee Dashboard
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReturnToTeamLead}
            className="flex items-center gap-2 text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Team Lead
          </Button>
        </div>

        {/* Render the employee dashboard */}
        <EmployeeDashboard user={mockUser} />
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
      {currentView === "assigned" && <AssignedDataView userId={user.id} userRole="team_lead" />}
      {currentView === "search" && <SearchDataView />}
      {currentView === "today" && <TodayDataView userId={user.id} userRole="team_lead" />}
      {currentView === "followup" && <FollowUpDataView userId={user.id} userRole="team_lead" />}
      {currentView === "hot" && <HotDataView userId={user.id} userRole="team_lead" />}
      {currentView === "block" && <BlockDataView userId={user.id} userRole="team_lead" />}
      {currentView === "general" && <GeneralDataView userId={user.id} userRole="team_lead" />}
      {currentView === "add" && <AddNewDataView userId={user.id} userRole="team_lead" />}
      {currentView === "request" && <RequestDataView userId={user.id} />}
      {currentView === "assign" && <DataAssignmentView userId={user.id} />}
      {currentView === "view-employees" && (
        <TeamLeadEmployeeView teamLeadId={user.id} onLoginAsUser={handleLoginAsUser} />
      )}
      {currentView === "overview" && <EmployeeDataOverviewView userId={user.id} />}
      {currentView === "recycle" && <RecycleBinView userRole="team_lead" />}
    </DashboardLayout>
  );
};

export default TeamLeadDashboard;
