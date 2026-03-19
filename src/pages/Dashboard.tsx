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
  const [isMobile, setIsMobile] = useState(false);

  // Mobile detection logic
  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /iphone|ipad|ipod|android|blackberry|windows phone/g.test(userAgent);
      
      if (width < 1024 || isMobileDevice) {
        setIsMobile(true);
      } else {
        setIsMobile(false);
      }
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><rect width="18" height="12" x="3" y="4" rx="2" ry="2"/><line x1="2" x2="22" y1="20" y2="20"/><line x1="12" x2="12" y1="20" y2="16"/></svg>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Desktop Only Access</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            This CRM is designed for professional desktop/laptop use only. Please log in from a computer to manage your data securely.
          </p>
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
            <p className="text-sm text-primary font-medium">Mobile & Tablet access is restricted for security.</p>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const cachedAuth = localStorage.getItem("dashboard_auth");

      if (!currentUser) {
        localStorage.removeItem("dashboard_auth");
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
      localStorage.setItem("dashboard_auth", JSON.stringify({
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
          const cached = localStorage.getItem("dashboard_auth");
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              parsed.name = profile.display_name;
              localStorage.setItem("dashboard_auth", JSON.stringify(parsed));
            } catch { }
          }
        }

        // IMPORTANT: Strictly enforce per-session approval
        if (currentRole && currentRole !== "admin") {
          // Check if this browser is already authorized
          const isSessionApproved = localStorage.getItem("is_session_approved");
          
          if (!isSessionApproved) {
            // New device/session: Check the database status
            const { data: currentApproval } = await (supabase
              .from("login_approvals" as any)
              .select("status")
              .eq("user_id", currentUser.id)
              .maybeSingle() as any);

            if (currentApproval?.status !== "approved") {
              // Not approved in DB: Kick out to Auth page
              console.log("No active approval found. Redirecting...");
              localStorage.removeItem("dashboard_auth");
              await supabase.auth.signOut();
              navigate("/auth");
              return;
            }

            // If approved in DB, "consume" it for this local machine
            const { error: updateError } = await (supabase
              .from("login_approvals" as any)
              .update({ status: "pending", requested_at: new Date().toISOString() })
              .eq("user_id", currentUser.id) as any);
            
            if (updateError) {
              console.error("Critical: Could not consume approval in DB.", updateError);
              localStorage.setItem("is_session_approved", "true");
            } else {
              // Mark this local machine as approved
              localStorage.setItem("is_session_approved", "true");
              console.log("Approval consumed successfully. Browser authorized.");
            }
          }
        }
      } catch (err) {
        console.error("Error in post-auth initialization:", err);
      }

      // Show welcome dialog on first load (check storage to avoid showing on refresh)
      const hasSeenWelcome = localStorage.getItem("hasSeenWelcome");
      if (!hasSeenWelcome && currentRole) {
        // Delay dialog slightly to let dashboard render first
        setTimeout(() => {
          setShowWelcomeDialog(true);
          localStorage.setItem("hasSeenWelcome", "true");
        }, 100);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        localStorage.removeItem("dashboard_auth");
        localStorage.removeItem("hasSeenWelcome");
        localStorage.removeItem("is_session_approved");
        navigate("/auth");
      } else if (_event === "SIGNED_IN" || _event === "TOKEN_REFRESHED") {
        // Only update on actual sign in or token refresh
        setUser(session.user);
        setUserName(session.user.email?.split("@")[0] || "User");

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

          if (currentRole) {
            setUserRole(currentRole);
            localStorage.setItem("dashboard_auth", JSON.stringify({
              user: { id: session.user.id, email: session.user.email },
              role: currentRole,
              name: profile?.display_name || session.user.email?.split("@")[0] || "User"
            }));
          } else {
            setUserRole(null);
            localStorage.removeItem("dashboard_auth");
          }

          if (profile?.display_name) {
            setUserName(profile.display_name);
          }

          if (_event === "SIGNED_IN" && currentRole && !localStorage.getItem("hasSeenWelcome")) {
            setShowWelcomeDialog(true);
            localStorage.setItem("hasSeenWelcome", "true");
          }
        }).catch(() => { });
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isInitialized) {
        supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
          if (!currentUser) {
            localStorage.removeItem("dashboard_auth");
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
