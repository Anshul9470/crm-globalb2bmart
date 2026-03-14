import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupRole, setSignupRole] = useState<"employee" | "team_lead" | "admin" | "seo_website">("employee");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First, authenticate the user
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("Authentication failed");
      }

      // Check user role first - admins can bypass approval
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id)
        .single();

      if (roleData?.role === "admin") {
        toast.success("Login successful!");
        navigate("/dashboard");
        return;
      }

      // For non-admins, enforce login approval
      const { data: approval, error: approvalError } = await (supabase
        .from("login_approvals" as any)
        .select("*")
        .eq("user_id", authData.user.id)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle() as any);

      if (approvalError) {
        console.error("Error fetching approval status:", approvalError);
      }

      // If no approval record exists, create one and send notification
      if (!approval) {
        const userName = authData.user.user_metadata?.display_name || authData.user.email?.split("@")[0] || "User";
        
        await (supabase
          .from("login_approvals" as any)
          .insert({
            user_id: authData.user.id,
            user_email: authData.user.email || loginEmail,
            user_name: userName,
            status: "pending",
          }) as any);

        await sendLoginApprovalEmail(authData.user.email || loginEmail, userName);
        await supabase.auth.signOut();
        toast.info("Your login request has been sent for approval. You will receive an email once approved.");
        return;
      }

      // Check approval status
      if (approval.status === "pending") {
        await supabase.auth.signOut();
        toast.info("Your login request is pending approval. Please wait for admin approval.");
        return;
      }

      if (approval.status === "rejected") {
        await supabase.auth.signOut();
        toast.error("Your login request has been rejected. Please contact admin.");
        return;
      }

      // If approved, allow login. Dashboard will "consume" this approval once it loads.
      if (approval.status === "approved") {
        toast.success("Login successful!");
        navigate("/dashboard");
      }
    } catch (error: any) {
      if (error.message?.includes("email_not_confirmed")) {
        toast.error("Please check your email and click the confirmation link before logging in.");
      } else if (error.message?.includes("Failed to fetch") || error.message?.includes("ERR_NAME_NOT_RESOLVED")) {
        toast.error("Cannot connect to server. Please check your internet connection and Supabase configuration.", {
          duration: 5000,
        });
        console.error("Supabase connection error:", error);
      } else {
        toast.error(error.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const sendLoginApprovalEmail = async (userEmail: string, userName: string) => {
    // Email notifications are disabled for now to avoid
    // CORS / Edge Function issues during local development.
    // Admins can review login requests directly in the dashboard.
    console.info("Login approval requested for:", { userEmail, userName });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) throw error;

      toast.success("Password reset email sent! Please check your inbox.");
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            display_name: signupName,
            // store more detailed intent for routing (SEO / Website etc.)
            role_type: signupRole,
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) throw error;

      if (data.user) {
        if (data.user.email_confirmed_at) {
          toast.success("Account created successfully! You can now login.");
        } else {
          toast.success("Account created! Please check your email to confirm your account before logging in.");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary">CRM System</CardTitle>
          <CardDescription>Manage your customer relationships efficiently</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full ">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger key="login-tab" value="login">Login</TabsTrigger>
              <TabsTrigger key="signup-tab" value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="Enter your email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="border-white/20 placeholder:text-white/60"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="border-white/20 placeholder:text-white/60"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    "Login"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Display Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Enter your name"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="border-white/20 placeholder:text-white/60"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="Enter your email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="border-white/20 placeholder:text-white/60"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Create a password (min 6 characters)"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="border-white/20 placeholder:text-white/60"
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2 text-white/90">
                  <Label className="text-black/80" htmlFor="signup-role">Select Your Role</Label>
                  <Select
                    value={signupRole}
                    onValueChange={(value: "employee" | "team_lead" | "admin" | "seo_website") =>
                      setSignupRole(value)
                    }
                  >
                    <SelectTrigger id="signup-role">
                      <SelectValue placeholder="Choose your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem key="role-employee" value="employee">Employee</SelectItem>
                      <SelectItem key="role-team_lead" value="team_lead">Team Lead</SelectItem>
                      <SelectItem key="role-admin" value="admin">Admin</SelectItem>
                      <SelectItem key="role-seo-website" value="seo_website">
                        SEO / Website (Employee)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Note: Admin role can only be assigned by existing admins
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Reset Password</DialogTitle>
            <DialogDescription className="text-white/80">
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="text-white">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="Enter your email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmail("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={resetLoading}>
                {resetLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
