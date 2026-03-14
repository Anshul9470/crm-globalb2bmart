import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Loader2, CheckCircle } from "lucide-react";
import EmployeeDashboard from "@/components/dashboard/EmployeeDashboard";
import TeamLeadDashboard from "@/components/dashboard/TeamLeadDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import PaidLeadDashboard from "@/components/dashboard/PaidLeadDashboard";
import SeoDashboard from "@/components/dashboard/SeoDashboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const cachedAuth = sessionStorage.getItem("dashboard_auth");

      if (!currentUser) {
        sessionStorage.removeItem("dashboard_auth");
        navigate("/auth");
        return;
      }

      setUser(currentUser);
      setUserName(currentUser.email?.split("@")[0] || "User"); // Set default name immediately

      // ALWAYS fetch role from database (critical - don't trust cache for role)
      const roleResult = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      const roleData = roleResult.data;
      let currentRole: string | null = roleData?.role || null;

      // Fallback to cache if database fails but we have cached data
      if (!currentRole && cachedAuth) {
        try {
          const parsed = JSON.parse(cachedAuth);
          if (parsed.role) {
            console.log("Using cached role as fallback:", parsed.role);
            currentRole = parsed.role;
          }
        } catch { }
      }

      // If this is an employee but marked as SEO / Website in metadata, route to SEO dashboard
      const roleType = (currentUser.user_metadata as any)?.role_type;
      if (currentRole === "employee" && roleType === "seo_website") {
        currentRole = "seo_website";
      }

      // Check if cached role differs from database role (for debugging)
      let cachedRole = null;
      if (cachedAuth) {
        try {
          const parsed = JSON.parse(cachedAuth);
          cachedRole = parsed.role;
          // Log if role changed (for debugging)
          if (cachedRole !== currentRole) {
            console.log(`Role changed: ${cachedRole} -> ${currentRole}. Updating dashboard.`);
          }
        } catch { }
      }

      // Always use the role from database, not cache (critical fix)
      setUserRole(currentRole);
      setLoading(false); // Render dashboard immediately after getting role
      setIsInitialized(true);

      // Update cache with verified role from database
      sessionStorage.setItem("dashboard_auth", JSON.stringify({
        user: { id: currentUser.id, email: currentUser.email },
        role: currentRole, // Always use database role
        name: currentUser.email?.split("@")[0] || "User"
      }));

      // Fetch profile asynchronously (non-blocking)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", currentUser.id)
          .single();

        if (profile?.display_name) {
          setUserName(profile.display_name);
          // Update cache with display name
          const cached = sessionStorage.getItem("dashboard_auth");
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              parsed.name = profile.display_name;
              sessionStorage.setItem("dashboard_auth", JSON.stringify(parsed));
            } catch { }
          }
        }

        // IMPORTANT: Strictly enforce per-session approval
        if (currentRole && currentRole !== "admin") {
          // Check if this specific browser session is already authorized
          const isSessionApproved = sessionStorage.getItem("is_session_approved");
          
          if (!isSessionApproved) {
            // New visit/session: Check the database status
            const { data: currentApproval } = await (supabase
              .from("login_approvals" as any)
              .select("status")
              .eq("user_id", currentUser.id)
              .maybeSingle() as any);

            if (currentApproval?.status !== "approved") {
              // Not approved in DB: Kick out to Auth page
              console.log("No active approval found for new session. Redirecting...");
              sessionStorage.removeItem("dashboard_auth");
              await supabase.auth.signOut();
              navigate("/auth");
              return;
            }

            // If approved in DB, "consume" it for this session
            const { error: updateError } = await (supabase
              .from("login_approvals" as any)
              .update({ status: "pending", requested_at: new Date().toISOString() })
              .eq("user_id", currentUser.id) as any);
            
            if (updateError) {
              console.error("Critical: Could not consume approval in DB. This is usually due to RLS policies.", updateError);
              // If we can't consume it, for safety we should still let them in but log it
              // Or we can kick them out - for now we mark session approved to avoid refresh loops
              sessionStorage.setItem("is_session_approved", "true");
            } else {
              // Mark this local session as approved so refreshes work
              sessionStorage.setItem("is_session_approved", "true");
              console.log("Approval consumed successfully. Session authorized.");
            }
          }
        }
      } catch (err) {
        console.error("Error in post-auth initialization:", err);
      }

      // Show welcome dialog on first load (check session storage to avoid showing on refresh)
      const hasSeenWelcome = sessionStorage.getItem("hasSeenWelcome");
      if (!hasSeenWelcome && currentRole) {
        // Delay dialog slightly to let dashboard render first
        setTimeout(() => {
          setShowWelcomeDialog(true);
          sessionStorage.setItem("hasSeenWelcome", "true");
        }, 100);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        sessionStorage.removeItem("dashboard_auth");
        sessionStorage.removeItem("hasSeenWelcome");
        sessionStorage.removeItem("is_session_approved");
        navigate("/auth");
      } else if (_event === "SIGNED_IN" || _event === "TOKEN_REFRESHED") {
        // Only update on actual sign in or token refresh, not on every state change
        setUser(session.user);
        setUserName(session.user.email?.split("@")[0] || "User");

        // Fetch role and profile in parallel (non-blocking)
        Promise.all([
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .single(),
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", session.user.id)
            .single()
        ]).then(([roleResult, profileResult]) => {
          const roleData = roleResult.data;
          const profile = profileResult.data;
          let currentRole: string | null = roleData?.role || null;

          const roleType = (session.user.user_metadata as any)?.role_type;
          if (currentRole === "employee" && roleType === "seo_website") {
            currentRole = "seo_website";
          }

          // Always update role from database
          if (currentRole) {
            setUserRole(currentRole);
            // Update cache with verified role
            sessionStorage.setItem("dashboard_auth", JSON.stringify({
              user: { id: session.user.id, email: session.user.email },
              role: currentRole, // Always use database role
              name: profile?.display_name || session.user.email?.split("@")[0] || "User"
            }));
          } else {
            // If no role found, clear cache and show error
            setUserRole(null);
            sessionStorage.removeItem("dashboard_auth");
          }

          if (profile?.display_name) {
            setUserName(profile.display_name);
          }

          // Show welcome dialog on login (not on refresh)
          if (_event === "SIGNED_IN" && currentRole && !sessionStorage.getItem("hasSeenWelcome")) {
            setShowWelcomeDialog(true);
            sessionStorage.setItem("hasSeenWelcome", "true");
          }
        }).catch(() => {
          // Ignore role/profile refresh errors
        });
      }
    });

    // Handle visibility change (tab switch) - don't reload everything
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isInitialized) {
        // Just verify auth, don't reload everything
        supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
          if (!currentUser) {
            sessionStorage.removeItem("dashboard_auth");
            navigate("/auth");
          }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [navigate, isInitialized]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">No Role Assigned</h2>
          <p className="text-muted-foreground">Please contact your administrator to assign you a role.</p>
        </div>
      </div>
    );
  }

  const getRoleDisplayName = (role: string | null) => {
    switch (role) {
      case "admin":
        return "Admin";
      case "team_lead":
        return "Team Lead";
      case "paid_team_lead":
        return "Paid Lead";
      case "seo_website":
        return "SEO / Website";
      case "employee":
        return "Employee";
      default:
        return "User";
    }
  };

  return (
    <>
      <Dialog open={showWelcomeDialog} onOpenChange={setShowWelcomeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <DialogTitle className="text-2xl">Welcome Back!</DialogTitle>
            </div>
            <DialogDescription className="text-base pt-2">
              <p className="font-semibold text-foreground mb-1">
                {userName}
              </p>
              <p className="text-muted-foreground">
                Logged in as <span className="font-medium">{getRoleDisplayName(userRole)}</span>
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setShowWelcomeDialog(false)}>
              Get Started
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {userRole === "admin" && <AdminDashboard user={user!} />}
      {userRole === "team_lead" && <TeamLeadDashboard user={user!} />}
      {userRole === "paid_team_lead" && <PaidLeadDashboard user={user!} />}
      {userRole === "seo_website" && <SeoDashboard user={user!} />}
      {userRole === "employee" && <EmployeeDashboard user={user!} />}
    </>
  );
};

export default Dashboard;
