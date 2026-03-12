import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Phone, Mail, MapPin, RotateCcw, Trash2, Search, Calendar, User, Share2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import FacebookDataCard from "./FacebookDataCard";

interface RecycleBinViewProps {
  userRole?: string;
  userId?: string;
}

interface DeletedCompany {
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

interface DeletedFacebookData {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  owner_name: string | null;
  products: string | null;
  services: string | null;
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

interface TeamMember {
  id: string;
  display_name: string;
  email: string;
}

const RecycleBinView = ({ userRole, userId }: RecycleBinViewProps) => {
  const [companies, setCompanies] = useState<DeletedCompany[]>([]);
  const [facebookData, setFacebookData] = useState<DeletedFacebookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentlyDeleting, setPermanentlyDeleting] = useState<string | null>(null);
  const [restoringFb, setRestoringFb] = useState<number | null>(null);
  const [permanentlyDeletingFb, setPermanentlyDeletingFb] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(userId);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [reassigningCompany, setReassigningCompany] = useState<string | null>(null);
  const [reassigningFb, setReassigningFb] = useState<number | null>(null);

  // Get userId from auth if not provided
  useEffect(() => {
    if (!currentUserId && userRole === "team_lead") {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          setCurrentUserId(user.id);
        }
      });
    } else if (userId) {
      setCurrentUserId(userId);
    }
  }, [userId, userRole]);

  const fetchDeletedCompanies = async () => {
    try {
      setLoading(true);

      let query: any;

      // Filter based on role and deletion_state
      if (userRole === "team_lead" && currentUserId) {
        // Team Lead sees companies with deletion_state='team_lead_recycle' deleted by their team members
        // First, get the team_id for this team lead from teams table (array to avoid 406)
        const { data: teamRows, error: teamError } = await (supabase
          .from("teams" as any)
          .select("id")
          .eq("team_lead_id", currentUserId)
          .limit(1) as any);
        const teamData = teamRows?.[0] || null;

        let teamMemberIds: string[] = [];

        if (teamError || !teamData) {
          console.warn("⚠️ RecycleBinView - Could not find team for companies, trying alternative approach");

          // Alternative approach: Try to find team members by querying all teams
          const { data: allTeams, error: allTeamsError } = await (supabase
            .from("teams" as any)
            .select("id, team_lead_id") as any);

          if (!allTeamsError && allTeams) {
            const userTeams = allTeams.filter((team: any) => team.team_lead_id === currentUserId);

            if (userTeams.length > 0) {
              const teamIds = userTeams.map((t: any) => t.id);
              const { data: allTeamMembers, error: membersError } = await (supabase
                .from("team_members" as any)
                .select("employee_id, team_id")
                .in("team_id", teamIds) as any);

              if (!membersError && allTeamMembers) {
                teamMemberIds = allTeamMembers.map((tm: any) => tm.employee_id);
                console.log("✅ RecycleBinView - Found team members for companies via alternative method:", teamMemberIds.length);
              }
            }
          }
        } else {
          // Original method worked - get team members
          const { data: teamMembers, error: teamMemberError } = await (supabase
            .from("team_members" as any)
            .select("employee_id")
            .eq("team_id", teamData.id) as any);

          if (teamMemberError) {
            console.error("Error fetching team members:", teamMemberError);
            // Continue with empty array - will use fallback
          } else {
            teamMemberIds = teamMembers?.map((tm: any) => tm.employee_id) || [];
          }
        }

        if (teamMemberIds.length > 0) {
          // Include TL's own deletions + team members' deletions
          const allDeletedByIds = [...new Set([...teamMemberIds, currentUserId])];
          query = supabase
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
            .eq("deletion_state", "team_lead_recycle")
            .in("deleted_by_id", allDeletedByIds);
        } else {
          // Fallback: Query all team_lead_recycle companies if we can't find team members
          console.warn("⚠️ RecycleBinView - No team members found for companies, querying all team_lead_recycle items as fallback");
          query = supabase
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
            .eq("deletion_state", "team_lead_recycle");

          console.log("🔍 RecycleBinView - Fallback query for companies (no deleted_by_id filter)");
        }
      } else if (userRole === "admin") {
        // Admin sees companies with deletion_state='admin_recycle' deleted by admins only
        // (not team leads - team lead deletions go to General Delete Data section)
        // First, get all admin IDs
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        const adminIds = admins?.map((a: any) => a.user_id) || [];

        if (adminIds.length === 0) {
          // No admins found, show empty
          setCompanies([]);
          setLoading(false);
          return;
        }

        query = supabase
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
          .in("deleted_by_id", adminIds);
      } else {
        // Fallback: show all deleted companies (for backward compatibility)
        query = supabase
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
          .not("deleted_at", "is", null);
      }

      const { data, error } = await (query.order("deleted_at", { ascending: false }) as any);

      console.log("📊 Companies query result:", {
        dataCount: data?.length || 0,
        error: error?.message,
        hasData: !!data,
        userRole,
        currentUserId
      });

      if (error) {
        // If deletion_state column doesn't exist, fall back to old behavior
        if (error.message?.includes("deletion_state")) {
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
            return;
          }
          setCompanies(fallbackData || []);
          return;
        }

        // If the columns don't exist yet, show a helpful message
        if (error.message.includes("deleted_by_id") || error.message.includes("deleted_at")) {
          toast.error("Database migration not applied yet. Please run the migration first.");
          setCompanies([]);
          return;
        }
        throw error;
      }

      console.log("✅ Fetched deleted companies:", (data || []).length, "items");

      // Always fetch comments separately to ensure we get them (RLS might prevent them in nested query)
      const companyIds = (data || []).map((c: any) => c.id);
      let commentsMap = new Map();

      if (companyIds.length > 0) {
        console.log("📝 RecycleBinView - Fetching comments separately for", companyIds.length, "companies...");
        const { data: allComments, error: commentsError } = await supabase
          .from("comments")
          .select("id, company_id, comment_text, category, created_at, user_id")
          .in("company_id", companyIds);

        if (commentsError) {
          console.warn("⚠️ RecycleBinView - Error fetching comments separately:", commentsError);
        } else if (allComments) {
          allComments.forEach((comment: any) => {
            if (!commentsMap.has(comment.company_id)) {
              commentsMap.set(comment.company_id, []);
            }
            commentsMap.get(comment.company_id).push(comment);
          });
          console.log("✅ RecycleBinView - Fetched comments separately:", allComments.length, "comments for", companyIds.length, "companies");
        }
      }

      // Sort comments by created_at descending (latest first) for each company
      const companiesWithSortedComments = (data || []).map((company: any) => {
        // Use separately fetched comments (more reliable than nested query)
        // Fallback to comments from query if separate fetch failed
        let comments = commentsMap.get(company.id) || company.comments || [];

        const sortedComments = comments
          ? [...comments].sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          : [];

        // Debug: Log comments for each company
        console.log("📝 RecycleBinView - Company comments:", {
          companyId: company.id,
          companyName: company.company_name,
          commentsCount: sortedComments.length,
          commentCategories: sortedComments.map((c: any) => ({ id: c.id, category: c.category, created_at: c.created_at }))
        });

        return {
          ...company,
          comments: sortedComments
        };
      });

      setCompanies(companiesWithSortedComments);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch deleted companies");
    } finally {
      setLoading(false);
    }
  };

  const fetchDeletedFacebookData = async () => {
    try {
      let query: any;

      // Filter based on role and deletion_state
      if (userRole === "team_lead" && currentUserId) {
        console.log("🔍 RecycleBinView - Team lead fetching Facebook data, userId:", currentUserId);

        // Team Lead sees Facebook data with deletion_state='team_lead_recycle' deleted by their team members
        // First, get the team_id for this team lead from teams table
        const { data: teamData, error: teamError } = await (supabase
          .from("teams" as any)
          .select("id, team_lead_id")
          .eq("team_lead_id", currentUserId)
          .maybeSingle() as any);

        console.log("🔍 RecycleBinView - Team lookup result:", {
          teamData,
          teamError: teamError?.message,
          hasTeam: !!teamData
        });

        let teamMemberIds: string[] = [];

        if (teamError || !teamData) {
          console.warn("⚠️ RecycleBinView - Could not find team via teams table, trying alternative approach");

          // Alternative approach: Try to find team members by querying team_members directly
          // and checking if any team has this user as team_lead
          const { data: allTeams, error: allTeamsError } = await (supabase
            .from("teams" as any)
            .select("id, team_lead_id") as any);

          if (!allTeamsError && allTeams) {
            // Find teams where current user is the team lead
            const userTeams = allTeams.filter((team: any) => team.team_lead_id === currentUserId);

            if (userTeams.length > 0) {
              console.log("✅ RecycleBinView - Found teams via alternative method:", userTeams.map((t: any) => t.id));

              // Get team members for all teams where user is team lead
              const teamIds = userTeams.map((t: any) => t.id);
              const { data: allTeamMembers, error: membersError } = await (supabase
                .from("team_members" as any)
                .select("employee_id, team_id")
                .in("team_id", teamIds) as any);

              if (!membersError && allTeamMembers) {
                teamMemberIds = allTeamMembers.map((tm: any) => tm.employee_id);
                console.log("✅ RecycleBinView - Found team members via alternative method:", teamMemberIds.length);
              }
            }
          }

          // If still no team members found, try querying all team_lead_recycle items
          // and filter client-side (less efficient but works as fallback)
          if (teamMemberIds.length === 0) {
            console.warn("⚠️ RecycleBinView - No team members found, will query all team_lead_recycle items");
            // We'll handle this case below
          }
        } else {
          // Original method worked - get team members
          const { data: teamMembers, error: teamMemberError } = await (supabase
            .from("team_members" as any)
            .select("employee_id, team_id")
            .eq("team_id", teamData.id) as any);

          console.log("🔍 RecycleBinView - Team members lookup result:", {
            teamMembers,
            teamMemberError: teamMemberError?.message,
            count: teamMembers?.length || 0
          });

          if (teamMemberError) {
            console.error("❌ RecycleBinView - Error fetching team members:", teamMemberError);
            // Continue with empty array - will query all items as fallback
          } else {
            teamMemberIds = teamMembers?.map((tm: any) => tm.employee_id) || [];
          }
        }

        console.log("👥 RecycleBinView - Team member IDs for Facebook data recycle bin:", teamMemberIds);
        console.log("🔍 RecycleBinView - Querying Facebook data with deletion_state='team_lead_recycle' deleted by:", teamMemberIds);

        if (teamMemberIds.length > 0) {
          // Include TL's own deletions + team members' deletions
          const allDeletedByIds = [...new Set([...teamMemberIds, currentUserId])];
          query = supabase
            .from("facebook_data" as any)
            .select("*")
            .eq("deletion_state", "team_lead_recycle")
            .in("deleted_by_id", allDeletedByIds);
        } else {
          // Fallback: Query all team_lead_recycle items if we can't find team members
          // This is less secure but ensures data is visible
          console.warn("⚠️ RecycleBinView - No team members found, querying all team_lead_recycle items as fallback");
          query = supabase
            .from("facebook_data" as any)
            .select("*")
            .eq("deletion_state", "team_lead_recycle");
        }
      } else if (userRole === "admin") {
        // Admin sees Facebook data with deletion_state='admin_recycle' deleted by admins only
        // (not team leads - team lead deletions go to Facebook Delete Data section)
        // First, get all admin IDs
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        const adminIds = admins?.map((a: any) => a.user_id) || [];

        if (adminIds.length === 0) {
          // No admins found, show empty
          setFacebookData([]);
          return;
        }

        query = supabase
          .from("facebook_data" as any)
          .select(`
            *,
            deleted_by:profiles!facebook_data_deleted_by_id_fkey(display_name, email)
          `)
          .eq("deletion_state", "admin_recycle")
          .in("deleted_by_id", adminIds);
      } else {
        // No Facebook data for other roles
        setFacebookData([]);
        return;
      }

      const { data, error } = await (query.order("deleted_at", { ascending: false }) as any);

      console.log("📊 Facebook data query result:", {
        count: data?.length || 0,
        error: error?.message,
        sample: data?.[0] ? { id: data[0].id, deleted_by_id: data[0].deleted_by_id, deletion_state: data[0].deletion_state } : null
      });

      if (error) {
        console.error("Error fetching deleted Facebook data:", error);
        // If deletion_state column doesn't exist, return empty array
        if (error.message?.includes("deletion_state") ||
          error.message?.includes("deleted_at") ||
          error.message?.includes("deleted_by_id") ||
          error.code === "PGRST204") {
          console.warn("Migration not applied or columns don't exist yet");
          setFacebookData([]);
          return;
        }
        throw error;
      }

      console.log("Fetched deleted Facebook data:", data?.length || 0, "items");

      // Fetch deleted_by profiles and comments separately
      if (data && data.length > 0) {
        try {
          // Get unique deleted_by_ids
          const deletedByIds = [...new Set(data.map((fb: any) => fb.deleted_by_id).filter(Boolean))];

          // Fetch deleted_by profiles
          let deletedByMap = new Map();
          if (deletedByIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, display_name, email")
              .in("id", deletedByIds);

            if (profiles) {
              profiles.forEach((profile: any) => {
                deletedByMap.set(profile.id, profile);
              });
            }
          }

          // Fetch comments for Facebook data
          const fbIds = data.map((fb: any) => fb.id);
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
              deleted_by: fb.deleted_by_id ? deletedByMap.get(fb.deleted_by_id) || null : null,
              comments: (commentsMap.get(fb.id) || []).sort((a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )
            }));

            setFacebookData(fbWithData);
          } else {
            setFacebookData(data.map((fb: any) => ({
              ...fb,
              deleted_by: fb.deleted_by_id ? deletedByMap.get(fb.deleted_by_id) || null : null,
              comments: []
            })));
          }
        } catch (fetchError) {
          console.warn("Could not fetch Facebook data details:", fetchError);
          setFacebookData(data.map((fb: any) => ({ ...fb, deleted_by: null, comments: [] })));
        }
      } else {
        setFacebookData([]);
      }
    } catch (error: any) {
      console.error("Error fetching deleted Facebook data:", error);
      setFacebookData([]);
    }
  };

  const fetchTeamMembers = async () => {
    if (userRole !== "team_lead" || !currentUserId) return;

    try {
      console.log("🔍 RecycleBinView - Fetching team members for team lead:", currentUserId);

      // First, try direct lookup (array + limit to avoid 406 on empty single)
      const { data: teamRows, error: teamError } = await (supabase
        .from("teams" as any)
        .select("id, team_lead_id")
        .eq("team_lead_id", currentUserId)
        .limit(1) as any);
      const teamData = teamRows?.[0] || null;

      let teamMemberIds: string[] = [];

      if (teamError || !teamData) {
        console.warn("⚠️ RecycleBinView - Could not find team via direct lookup, trying alternative approach");
        console.log("Team lookup details:", { teamError: teamError?.message, teamData, currentUserId });

        // Alternative approach: Query all teams and filter
        const { data: allTeams, error: allTeamsError } = await (supabase
          .from("teams" as any)
          .select("id, team_lead_id") as any);

        console.log("All teams query result:", {
          allTeams: allTeams?.length || 0,
          allTeamsError: allTeamsError?.message,
          sampleTeam: allTeams?.[0]
        });

        if (allTeamsError || !allTeams) {
          console.error("❌ RecycleBinView - Could not fetch teams:", allTeamsError);
          setTeamMembers([]);
          return;
        }

        const userTeams = allTeams.filter((team: any) => team.team_lead_id === currentUserId);
        console.log("User teams after filter:", {
          userTeamsCount: userTeams.length,
          userTeams: userTeams.map((t: any) => ({ id: t.id, team_lead_id: t.team_lead_id }))
        });

        if (userTeams.length === 0) {
          console.warn("⚠️ RecycleBinView - No teams found for team lead");
          setTeamMembers([]);
          return;
        }

        const teamIds = userTeams.map((t: any) => t.id);
        console.log("✅ RecycleBinView - Found teams via alternative method:", teamIds);

        // Get team members for all teams where user is team lead
        const { data: allTeamMembers, error: membersError } = await (supabase
          .from("team_members" as any)
          .select("employee_id, team_id")
          .in("team_id", teamIds) as any);

        console.log("Team members query result:", {
          allTeamMembers: allTeamMembers?.length || 0,
          membersError: membersError?.message,
          sampleMember: allTeamMembers?.[0]
        });

        if (membersError || !allTeamMembers) {
          console.error("❌ RecycleBinView - Could not fetch team members:", membersError);
          setTeamMembers([]);
          return;
        }

        teamMemberIds = allTeamMembers.map((tm: any) => tm.employee_id);
        console.log("✅ RecycleBinView - Found team members via alternative method:", teamMemberIds.length);
      } else {
        // Original method worked - get team members
        console.log("✅ RecycleBinView - Found team via direct lookup:", teamData.id);

        const { data: teamMembers, error: teamMemberError } = await (supabase
          .from("team_members" as any)
          .select("employee_id, team_id")
          .eq("team_id", teamData.id) as any);

        if (teamMemberError) {
          console.error("❌ RecycleBinView - Error fetching team members:", teamMemberError);
          setTeamMembers([]);
          return;
        }

        teamMemberIds = teamMembers?.map((tm: any) => tm.employee_id) || [];
        console.log("✅ RecycleBinView - Found team members via direct method:", teamMemberIds.length);
      }

      if (teamMemberIds.length === 0) {
        console.warn("⚠️ RecycleBinView - No team members found");
        setTeamMembers([]);
        return;
      }

      // Fetch employee profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", teamMemberIds);

      if (profilesError || !profiles) {
        console.error("❌ RecycleBinView - Could not fetch team member profiles:", profilesError);
        setTeamMembers([]);
        return;
      }

      const members = profiles.map((p: any) => ({
        id: p.id,
        display_name: p.display_name || p.email?.split("@")[0] || "Unknown",
        email: p.email || ""
      }));

      console.log("✅ RecycleBinView - Successfully fetched team members:", members.length);
      setTeamMembers(members);
    } catch (error) {
      console.error("❌ RecycleBinView - Error fetching team members:", error);
      setTeamMembers([]);
    }
  };

  useEffect(() => {
    if (userRole === "team_lead" && !currentUserId) {
      // Wait for userId to be fetched
      return;
    }

    fetchDeletedCompanies();
    fetchDeletedFacebookData();

    // Fetch team members for team leads
    if (userRole === "team_lead") {
      fetchTeamMembers();
    }

    // Listen for data update events to refresh the view
    const handleDataUpdate = () => {
      fetchDeletedCompanies();
      fetchDeletedFacebookData();
    };

    window.addEventListener('companyDataUpdated', handleDataUpdate);
    window.addEventListener('facebookDataUpdated', handleDataUpdate);

    return () => {
      window.removeEventListener('companyDataUpdated', handleDataUpdate);
      window.removeEventListener('facebookDataUpdated', handleDataUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, userRole]);

  const handleReassignCompany = async (companyId: string, employeeId: string) => {
    if (!employeeId) {
      toast.error("Please select an employee to reassign");
      return;
    }

    // Ensure the selected employee belongs to this team lead's team
    const isTeamMember = teamMembers.some((m) => m.id === employeeId);
    if (!isTeamMember) {
      toast.error("You can only reassign to your own team members.");
      return;
    }

    try {
      setReassigningCompany(companyId);
      const nowIso = new Date().toISOString();

      // Delete ALL comments when reassigning to ensure data appears in Assigned Data section
      // This gives the reassigned data a fresh start without any categorization
      // First, check how many comments exist
      const { data: existingComments } = await supabase
        .from("comments")
        .select("id, category")
        .eq("company_id", companyId);

      console.log(`🔍 Found ${existingComments?.length || 0} comment(s) for company:`, companyId, existingComments?.map((c: any) => c.category));

      // Delete all comments
      const { error: deleteCommentsError } = await supabase
        .from("comments")
        .delete()
        .eq("company_id", companyId);

      if (deleteCommentsError) {
        console.warn("⚠️ Could not delete comments:", deleteCommentsError);
      } else {
        console.log(`✅ Deleted ${existingComments?.length || 0} comment(s) for company:`, companyId, "- Data will appear in Assigned Data section");
      }

      // Verify comments are deleted before proceeding - wait a bit for database to sync
      await new Promise(resolve => setTimeout(resolve, 200));

      const { data: remainingComments } = await supabase
        .from("comments")
        .select("id, category")
        .eq("company_id", companyId);

      if (remainingComments && remainingComments.length > 0) {
        console.error("❌ ERROR: Comments still exist after deletion! Attempting force delete:", remainingComments);
        // Try to delete again with force
        const { error: retryError } = await supabase
          .from("comments")
          .delete()
          .eq("company_id", companyId);
        if (retryError) {
          console.error("❌ Failed to delete comments on retry:", retryError);
        } else {
          console.log("✅ Force deleted remaining comments on retry");
        }
      } else {
        console.log("✅ Verified: All comments deleted for company:", companyId);
      }

      const { error, data: updateData } = await supabase
        .from("companies")
        .update({
          assigned_to_id: employeeId,
          assigned_at: nowIso,
          deleted_at: null,
          deleted_by_id: null,
          deletion_state: null
        })
        .eq("id", companyId)
        .select("id, assigned_to_id, assigned_at, deletion_state");

      console.log("🔄 RecycleBinView - Company reassignment update:", {
        companyId,
        employeeId,
        updateData,
        error: error?.message,
        assigned_at: nowIso,
        blockCommentsDeleted: !deleteCommentsError
      });

      if (error) {
        // Fallback if deletion_state column doesn't exist
        if (error.message?.includes("deletion_state")) {
          const { error: fallbackError } = await supabase
            .from("companies")
            .update({
              assigned_to_id: employeeId,
              assigned_at: nowIso,
              deleted_at: null,
              deleted_by_id: null
            })
            .eq("id", companyId);

          if (fallbackError) throw fallbackError;
        } else {
          throw error;
        }
      }

      // Verify the update was successful
      if (updateData && updateData.length > 0) {
        const updatedCompany = updateData[0];
        console.log("✅ RecycleBinView - Company reassignment verified:", {
          companyId: updatedCompany.id,
          assigned_to_id: updatedCompany.assigned_to_id,
          assigned_at: updatedCompany.assigned_at,
          deletion_state: updatedCompany.deletion_state,
          matchesEmployeeId: updatedCompany.assigned_to_id === employeeId,
          assignedAtIsRecent: updatedCompany.assigned_at ?
            (Date.now() - new Date(updatedCompany.assigned_at).getTime()) < 5000 : false
        });
      }

      const employeeName = teamMembers.find(m => m.id === employeeId)?.display_name || "employee";
      toast.success(`Company reassigned to ${employeeName} successfully!`);

      // Add delay to ensure database update is committed before refreshing
      setTimeout(() => {
        // Dispatch event to refresh assigned data for the employee
        if (typeof window !== "undefined") {
          console.log("📢 RecycleBinView - Dispatching companyDataUpdated event for employee:", employeeId);
          window.dispatchEvent(new CustomEvent("companyDataUpdated", {
            detail: { employeeId, companyId }
          }));
          // Dispatch again after delays to ensure it's caught
          setTimeout(() => {
            console.log("📢 RecycleBinView - Dispatching second companyDataUpdated event");
            window.dispatchEvent(new CustomEvent("companyDataUpdated", {
              detail: { employeeId, companyId }
            }));
          }, 1000);
          setTimeout(() => {
            console.log("📢 RecycleBinView - Dispatching third companyDataUpdated event");
            window.dispatchEvent(new CustomEvent("companyDataUpdated", {
              detail: { employeeId, companyId }
            }));
          }, 2500);
        }
      }, 500);

      fetchDeletedCompanies();
    } catch (error: any) {
      toast.error(error.message || "Failed to reassign company");
    } finally {
      setReassigningCompany(null);
    }
  };

  const handleReassignFacebookData = async (fbId: number, employeeId: string) => {
    if (!employeeId) {
      toast.error("Please select an employee to reassign");
      return;
    }

    // Ensure the selected employee belongs to this team lead's team
    const isTeamMember = teamMembers.some((m) => m.id === employeeId);
    if (!isTeamMember) {
      toast.error("You can only reassign to your own team members.");
      return;
    }

    try {
      setReassigningFb(fbId);
      const nowIso = new Date().toISOString();

      // Delete ALL comments when reassigning to ensure data appears in Assigned Data section
      // This gives the reassigned data a fresh start without any categorization
      // First, check how many comments exist
      const { data: existingComments } = await (supabase
        .from("facebook_data_comments" as any)
        .select("id, category")
        .eq("facebook_data_id", fbId) as any);

      console.log(`🔍 Found ${existingComments?.length || 0} comment(s) for Facebook data:`, fbId, existingComments?.map((c: any) => c.category));

      // Delete all comments
      const { error: deleteCommentsError } = await (supabase
        .from("facebook_data_comments" as any)
        .delete()
        .eq("facebook_data_id", fbId) as any);

      if (deleteCommentsError) {
        console.warn("⚠️ Could not delete comments:", deleteCommentsError);
      } else {
        console.log(`✅ Deleted ${existingComments?.length || 0} comment(s) for Facebook data:`, fbId, "- Data will appear in Assigned Data section");
      }

      // Verify comments are deleted before proceeding - wait a bit for database to sync
      await new Promise(resolve => setTimeout(resolve, 200));

      const { data: remainingComments } = await (supabase
        .from("facebook_data_comments" as any)
        .select("id, category")
        .eq("facebook_data_id", fbId) as any);

      if (remainingComments && remainingComments.length > 0) {
        console.error("❌ ERROR: Comments still exist after deletion! Attempting force delete:", remainingComments);
        // Try to delete again with force
        const { error: retryError } = await (supabase
          .from("facebook_data_comments" as any)
          .delete()
          .eq("facebook_data_id", fbId) as any);
        if (retryError) {
          console.error("❌ Failed to delete comments on retry:", retryError);
        } else {
          console.log("✅ Force deleted remaining comments on retry");
        }
      } else {
        console.log("✅ Verified: All comments deleted for Facebook data:", fbId);
      }

      // Then, restore the Facebook data (clear deletion_state)
      const { error: restoreError } = await (supabase
        .from("facebook_data" as any)
        .update({
          deleted_at: null,
          deleted_by_id: null,
          deletion_state: null
        })
        .eq("id", fbId) as any);

      if (restoreError) throw restoreError;

      // Then share it with the selected employee
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if already shared
      const { data: existingShare } = await (supabase
        .from("facebook_data_shares" as any)
        .select("id")
        .eq("facebook_data_id", fbId)
        .eq("employee_id", employeeId)
        .maybeSingle() as any);

      if (!existingShare) {
        // Create new share
        const { error: shareError } = await (supabase
          .from("facebook_data_shares" as any)
          .insert([{
            facebook_data_id: fbId,
            employee_id: employeeId,
            shared_by_id: user.id,
            created_at: nowIso
          }]) as any);

        if (shareError) {
          console.warn("Could not create share, but data was restored:", shareError);
        }
      } else {
        // Update existing share's created_at timestamp to mark it as newly reassigned
        // This ensures it appears in the Assigned Data section
        const { error: updateError } = await (supabase
          .from("facebook_data_shares" as any)
          .update({
            created_at: nowIso,
            shared_by_id: user.id
          })
          .eq("id", existingShare.id) as any);

        if (updateError) {
          console.warn("Could not update share timestamp, but data was restored:", updateError);
        } else {
          console.log("✅ Updated Facebook data share timestamp for reassignment:", {
            shareId: existingShare.id,
            facebookDataId: fbId,
            employeeId: employeeId,
            newCreatedAt: nowIso
          });
        }
      }

      const employeeName = teamMembers.find(m => m.id === employeeId)?.display_name || "employee";
      toast.success(`Facebook data reassigned to ${employeeName} successfully!`);

      // Add delay to ensure database update is committed before refreshing
      setTimeout(() => {
        // Dispatch event to refresh data
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("facebookDataUpdated"));
          // Dispatch again after a short delay to ensure it's caught
          setTimeout(() => {
            window.dispatchEvent(new Event("facebookDataUpdated"));
          }, 500);
        }
      }, 500);

      fetchDeletedFacebookData();
    } catch (error: any) {
      toast.error(error.message || "Failed to reassign Facebook data");
    } finally {
      setReassigningFb(null);
    }
  };

  const handleRestore = async (companyId: string) => {
    // Only allow restore for admins, not team leads
    if (userRole === "team_lead") {
      toast.error("Team leads cannot restore companies. Please reassign to an employee instead.");
      return;
    }

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
    } catch (error: any) {
      toast.error(error.message || "Failed to restore company");
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async (companyId: string) => {
    // For team leads, move to admin recycle bin instead of permanent delete
    if (userRole === "team_lead") {
      if (!confirm("Are you sure you want to delete this company? It will be moved to the admin's recycle bin.")) {
        return;
      }

      try {
        setPermanentlyDeleting(companyId);
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user) {
          throw new Error("Not authenticated");
        }

        console.log("🗑️ RecycleBinView - Team lead deleting company, moving to admin_recycle:", {
          companyId,
          deletedBy: userData.user.id,
          deletionState: 'admin_recycle',
          userRole: userRole
        });

        const { data: updateResult, error } = await supabase
          .from("companies")
          .update({
            deletion_state: 'admin_recycle' as any,
            deleted_at: new Date().toISOString(),
            deleted_by_id: userData.user.id
          } as any)
          .eq("id", companyId)
          .select("id, deletion_state, deleted_by_id, deleted_at, company_name");

        if (error) {
          console.error("❌ RecycleBinView - Error updating company:", error);
          // Fallback if deletion_state column doesn't exist
          if (error.message?.includes("deletion_state")) {
            const { error: fallbackError } = await supabase
              .from("companies")
              .update({
                deleted_at: new Date().toISOString(),
                deleted_by_id: userData.user.id
              })
              .eq("id", companyId);

            if (fallbackError) throw fallbackError;
          } else {
            throw error;
          }
        }

        console.log("✅ RecycleBinView - Company updated successfully:", {
          updateResult,
          companyId,
          deleted_by_id: updateResult?.[0]?.deleted_by_id,
          deletion_state: updateResult?.[0]?.deletion_state,
          deleted_at: updateResult?.[0]?.deleted_at
        });

        // Verify the update was successful by querying the company again
        const { data: verifyData } = await supabase
          .from("companies")
          .select("id, deletion_state, deleted_by_id, company_name")
          .eq("id", companyId)
          .single();

        console.log("🔍 RecycleBinView - Verification query result:", verifyData);

        toast.success("Company moved to General Delete Data section");
        fetchDeletedCompanies();

        // Add a delay to ensure database update is committed before refreshing views
        setTimeout(() => {
          // Dispatch event to refresh admin dashboard counts and views
          if (typeof window !== "undefined") {
            console.log("📢 RecycleBinView - Dispatching companyDataUpdated event");
            window.dispatchEvent(new Event("companyDataUpdated"));
          }
        }, 1000);

        // Dispatch again after a longer delay to ensure it's caught
        setTimeout(() => {
          if (typeof window !== "undefined") {
            console.log("📢 RecycleBinView - Dispatching second companyDataUpdated event");
            window.dispatchEvent(new Event("companyDataUpdated"));
          }
        }, 2000);
      } catch (error: any) {
        toast.error(error.message || "Failed to move company to admin recycle bin");
      } finally {
        setPermanentlyDeleting(null);
      }
      return;
    }

    // For admins, permanent delete
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
    } catch (error: any) {
      toast.error(error.message || "Failed to permanently delete company");
    } finally {
      setPermanentlyDeleting(null);
    }
  };

  const handleRestoreFacebookData = async (fbId: number) => {
    // Only allow restore for admins, not team leads
    if (userRole === "team_lead") {
      toast.error("Team leads cannot restore Facebook data. Please reassign to an employee instead.");
      return;
    }

    try {
      setRestoringFb(fbId);

      // Restore Facebook data: clear deletion_state and deleted_at
      const updateData: any = {
        deleted_at: null,
        deleted_by_id: null,
        deletion_state: null
      };

      const { error } = await (supabase
        .from("facebook_data" as any)
        .update(updateData)
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
    } catch (error: any) {
      toast.error(error.message || "Failed to restore Facebook data");
    } finally {
      setRestoringFb(null);
    }
  };

  const handlePermanentDeleteFacebookData = async (fbId: number) => {
    // For team leads, move to admin recycle bin instead of permanent delete
    if (userRole === "team_lead") {
      if (!confirm("Are you sure you want to delete this Facebook data? It will be moved to the admin's recycle bin.")) {
        return;
      }

      try {
        setPermanentlyDeletingFb(fbId);
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user) {
          throw new Error("Not authenticated");
        }

        console.log("🗑️ RecycleBinView - Team lead deleting Facebook data, moving to admin_recycle:", {
          fbId,
          deletedBy: userData.user.id,
          deletionState: 'admin_recycle'
        });

        const { data: updateResult, error } = await (supabase
          .from("facebook_data" as any)
          .update({
            deletion_state: 'admin_recycle' as any,
            deleted_at: new Date().toISOString(),
            deleted_by_id: userData.user.id
          })
          .eq("id", fbId)
          .select("id, deletion_state, deleted_by_id, deleted_at") as any);

        console.log("✅ RecycleBinView - Facebook data updated successfully:", updateResult);

        if (error) {
          // Check if columns don't exist (migration not run)
          if (error.message?.includes("deleted_at") ||
            error.message?.includes("deletion_state") ||
            error.message?.includes("deleted_by_id") ||
            error.code === "PGRST204") {
            toast.error(
              "Database migration not applied. Please run the migration: 20250120000003_add_deletion_state_to_facebook_data.sql in Supabase SQL Editor.",
              { duration: 10000 }
            );
            return;
          }

          throw error;
        }

        toast.success("Facebook data moved to Facebook Delete Data section");
        fetchDeletedFacebookData();

        // Add a small delay to ensure database update is committed before refreshing views
        setTimeout(() => {
          // Dispatch event to refresh admin dashboard counts and views
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("facebookDataUpdated"));
          }
        }, 500);
      } catch (error: any) {
        toast.error(error.message || "Failed to move Facebook data to admin recycle bin");
      } finally {
        setPermanentlyDeletingFb(null);
      }
      return;
    }

    // For admins, permanent delete
    if (!confirm("Are you sure you want to permanently delete this Facebook data? This action cannot be undone.")) {
      return;
    }

    try {
      setPermanentlyDeletingFb(fbId);
      const { error } = await (supabase
        .from("facebook_data" as any)
        .delete()
        .eq("id", fbId) as any);

      if (error) throw error;

      toast.success("Facebook data permanently deleted!");
      fetchDeletedFacebookData();
    } catch (error: any) {
      toast.error(error.message || "Failed to permanently delete Facebook data");
    } finally {
      setPermanentlyDeletingFb(null);
    }
  };

  const filteredCompanies = companies.filter(company =>
    company.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.owner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (company.email && company.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredFacebookData = facebookData.filter(fb =>
    (fb.name && fb.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (fb.company_name && fb.company_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (fb.email && fb.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (fb.owner_name && fb.owner_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'hot': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400';
      case 'follow_up': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400';
      case 'block': return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400';
      case 'general': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400';
      default: return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'hot': return 'Prime Pool';
      case 'follow_up': return 'Active Pool';
      case 'block': return 'Inactive Pool';
      case 'general': return 'General Data';
      default: return 'Uncategorized';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'hot': return '🔥';
      case 'follow_up': return '📅';
      case 'block': return '🚫';
      case 'general': return '📋';
      default: return '📄';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Recycle Bin</h2>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading deleted items...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Recycle Bin</h2>
        <Badge variant="secondary" className="text-sm">
          {companies.length + facebookData.length} deleted {companies.length + facebookData.length === 1 ? 'item' : 'items'}
        </Badge>
      </div>

      <div className="flex items-center space-x-2 ">
        <div className="relative flex-1 max-w-sm ">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 text-white/80" />
          <Input
            placeholder="Search deleted items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 text-white placeholder:text-white/60"
          />
        </div>
      </div>

      {filteredCompanies.length === 0 && filteredFacebookData.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Trash2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm ? "No matching items found" : "No deleted items"}
            </h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Deleted items will appear here"
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredCompanies.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 text-white">Deleted Companies</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredCompanies.map((company) => {
                  // Get all comments (sorted by created_at descending)
                  const allComments = company.comments || [];
                  const lastComment = allComments.length > 0 ? allComments[0] : null;

                  // Determine category: check all comments for categories (not just latest)
                  // Priority: latest comment with category > any "block" comment > inferred from context > null
                  let currentCategory = null;

                  // First, try to get category from latest comment
                  if (lastComment?.category && lastComment.category.trim() !== '') {
                    currentCategory = lastComment.category;
                  }

                  // If no category from latest comment, check if there's any "block" comment
                  // This handles cases where data was deleted from inactive pool
                  if (!currentCategory && allComments.length > 0) {
                    const blockComment = allComments.find((c: any) => c.category === 'block');
                    if (blockComment) {
                      currentCategory = 'block';
                    }
                  }

                  // Fallback: If no comments and deleted by employee (not team lead/admin), 
                  // infer it came from inactive pool (for companies deleted before block comment logic was added)
                  if (!currentCategory && allComments.length === 0 && company.deleted_by_id) {
                    // Check if deleted_by is an employee (not team lead or admin)
                    // If deletion_state is 'team_lead_recycle' and deleted_by is not the current user (team lead),
                    // it was likely deleted by an employee from inactive pool
                    if (company.deletion_state === 'team_lead_recycle' &&
                      company.deleted_by_id !== currentUserId &&
                      userRole === 'team_lead') {
                      // Infer it came from inactive pool
                      currentCategory = 'block';
                      console.log("🔍 RecycleBinView - Inferred 'block' category for company without comments:", company.id);
                    }
                  }

                  // Debug logging
                  console.log("🏷️ RecycleBinView - Company category detection:", {
                    companyId: company.id,
                    companyName: company.company_name,
                    commentsCount: allComments.length,
                    lastCommentCategory: lastComment?.category,
                    allCommentCategories: allComments.map((c: any) => c.category),
                    deletedBy: company.deleted_by_id,
                    deletionState: company.deletion_state,
                    currentUserId,
                    userRole,
                    currentCategory
                  });

                  return (
                    <Card key={company.id} className="relative">
                      <CardHeader className="relative pb-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Building2 className="h-5 w-5 text-primary" />
                              <CardTitle>{company.company_name}</CardTitle>
                            </div>
                            <p className="text-sm text-muted-foreground">{company.owner_name}</p>
                          </div>
                          <div className="absolute right-0 top-0">
                            {currentCategory ? (
                              <Badge className={cn("flex-shrink-0 border", getCategoryColor(currentCategory))}>
                                <span className="mr-1">{getCategoryIcon(currentCategory)}</span>
                                {getCategoryLabel(currentCategory)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="flex-shrink-0">
                                Uncategorized
                              </Badge>
                            )}
                          </div>
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
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-muted-foreground">Last Comment</p>
                              {currentCategory && userRole !== "team_lead" && (
                                <Badge className={cn("text-xs", getCategoryColor(currentCategory))}>
                                  {getCategoryIcon(currentCategory)} {getCategoryLabel(currentCategory)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm">{lastComment.comment_text}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Added: {new Date(lastComment.created_at).toLocaleString()}
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2">
                          {userRole === "team_lead" ? (
                            // Team lead: Show reassignment dropdown instead of restore
                            <Select
                              onValueChange={(employeeId) => handleReassignCompany(company.id, employeeId)}
                              disabled={reassigningCompany === company.id || teamMembers.length === 0}
                            >
                              <SelectTrigger className="flex-1" disabled={reassigningCompany === company.id || teamMembers.length === 0}>
                                <SelectValue placeholder={reassigningCompany === company.id ? "Reassigning..." : teamMembers.length === 0 ? "No team members" : "Reassign to..."} />
                              </SelectTrigger>
                              <SelectContent>
                                {teamMembers.map((member) => (
                                  <SelectItem key={member.id} value={member.id}>
                                    <div className="flex items-center gap-2">
                                      <User className="h-4 w-4" />
                                      <span>{member.display_name}</span>
                                      {member.email && (
                                        <span className="text-xs text-muted-foreground">({member.email})</span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            // Admin: Show restore button
                            <Button
                              onClick={() => handleRestore(company.id)}
                              disabled={restoring === company.id}
                              className="flex-1"
                              variant="outline"
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              {restoring === company.id ? "Restoring..." : "Restore"}
                            </Button>
                          )}
                          <Button
                            onClick={() => handlePermanentDelete(company.id)}
                            disabled={permanentlyDeleting === company.id || reassigningCompany === company.id}
                            variant="destructive"
                            size="icon"
                            title={userRole === "team_lead" ? "Move to Admin's recycle bin" : "Permanently delete"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {filteredFacebookData.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 text-white">Deleted Facebook Data</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredFacebookData.map((fb) => {
                  // Get all comments (sorted by created_at descending)
                  const allComments = fb.comments || [];
                  const lastComment = allComments.length > 0 ? allComments[0] : null;

                  // Determine category: check all comments for categories (not just latest)
                  // Priority: latest comment with category > any "block" comment > inferred from context > null
                  let currentCategory = null;

                  // First, try to get category from latest comment
                  if (lastComment?.category && lastComment.category.trim() !== '') {
                    currentCategory = lastComment.category;
                  }

                  // If no category from latest comment, check if there's any "block" comment
                  // This handles cases where data was deleted from inactive pool
                  if (!currentCategory && allComments.length > 0) {
                    const blockComment = allComments.find((c: any) => c.category === 'block');
                    if (blockComment) {
                      currentCategory = 'block';
                    }
                  }

                  // Fallback: If no comments and deleted by employee (not team lead/admin), 
                  // infer it came from inactive pool (for data deleted before block comment logic was added)
                  if (!currentCategory && allComments.length === 0 && fb.deleted_by_id) {
                    // Check if deleted_by is an employee (not team lead or admin)
                    // If deletion_state is 'team_lead_recycle' and deleted_by is not the current user (team lead),
                    // it was likely deleted by an employee from inactive pool
                    if (fb.deletion_state === 'team_lead_recycle' &&
                      fb.deleted_by_id !== currentUserId &&
                      userRole === 'team_lead') {
                      // Infer it came from inactive pool
                      currentCategory = 'block';
                      console.log("🔍 RecycleBinView - Inferred 'block' category for Facebook data without comments:", fb.id);
                    }
                  }

                  // Debug logging
                  console.log("🏷️ RecycleBinView - Facebook data category detection:", {
                    fbId: fb.id,
                    fbName: fb.name || fb.company_name,
                    commentsCount: allComments.length,
                    lastCommentCategory: lastComment?.category,
                    allCommentCategories: allComments.map((c: any) => c.category),
                    deletedBy: fb.deleted_by_id,
                    deletionState: fb.deletion_state,
                    currentUserId,
                    userRole,
                    currentCategory
                  });

                  return (
                    <FacebookDataCard
                      key={fb.id}
                      data={fb}
                      onUpdate={() => {
                        fetchDeletedCompanies();
                        fetchDeletedFacebookData();
                      }}
                      onRestore={userRole === "admin" ? () => handleRestoreFacebookData(fb.id) : undefined}
                      onDelete={() => handlePermanentDeleteFacebookData(fb.id)}
                      userRole={userRole}
                      isDeleted={true}
                      customFooter={userRole === "team_lead" ? (
                        <div className="flex gap-2 w-full">
                          <Select
                            onValueChange={(employeeId) => handleReassignFacebookData(fb.id, employeeId)}
                            disabled={reassigningFb === fb.id || teamMembers.length === 0}
                          >
                            <SelectTrigger className="flex-1 overflow-hidden" disabled={reassigningFb === fb.id || teamMembers.length === 0}>
                              <SelectValue placeholder={reassigningFb === fb.id ? "Reassigning..." : teamMembers.length === 0 ? "No team members" : "Reassign to..."} />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-full max-h-[200px]">
                                {teamMembers.map((member) => (
                                  <SelectItem key={member.id} value={member.id}>
                                    <div className="flex items-center gap-2">
                                      <User className="h-4 w-4" />
                                      <span>{member.display_name}</span>
                                      {member.email && (
                                        <span className="text-xs text-muted-foreground">({member.email})</span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </ScrollArea>
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() => handlePermanentDeleteFacebookData(fb.id)}
                            disabled={permanentlyDeletingFb === fb.id || reassigningFb === fb.id}
                            variant="destructive"
                            size="icon"
                            className="shrink-0"
                            title="Move to Admin's recycle bin"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecycleBinView;
