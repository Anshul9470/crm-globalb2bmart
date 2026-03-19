import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  LogOut,
  Share2,
  Search,
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import AssignedDataView from "./views/AssignedDataView";
import FacebookDataView from "./views/FacebookDataView";
import TodayDataView from "./views/TodayDataView";
import FollowUpDataView from "./views/FollowUpDataView";
import HotDataView from "./views/HotDataView";
import BlockDataView from "./views/BlockDataView";
import GeneralDataView from "./views/GeneralDataView";
import AddNewDataView from "./views/AddNewDataView";
import RequestDataView from "./views/RequestDataView";
import SearchDataView from "./views/SearchDataView";

interface EmployeeDashboardProps {
  user: User;
}

const EmployeeDashboard = ({ user }: EmployeeDashboardProps) => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState("assigned");
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [userName, setUserName] = useState<string>("");

  const handleLogout = async () => {
    // Reset login approval status to pending on logout for security
    try {
      await (supabase
        .from("login_approvals" as any)
        .update({ status: "pending", requested_at: new Date().toISOString() })
        .eq("user_id", user.id) as any);
    } catch (e) {
      console.error("Logout approval sync failed:", e);
    }

    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  const fetchCategoryCounts = async () => {
    try {
      const counts: Record<string, number> = {};

      // Initialize assigned count to 0 to prevent stale data
      counts.assigned = 0;

      // Use the user.id prop directly (this is the employee's ID when viewing as team lead)
      // The AssignedDataView also uses userId prop, but falls back to authUser if there's a mismatch
      // For count calculation, we should use the same userId that AssignedDataView will use
      // When team lead views employee dashboard, user.id is the employee's ID from mockUser
      const countUserId = user.id;

      // Fetch assigned companies count (without comments, within 24 hours)
      // Match the EXACT filtering logic from AssignedDataView.fetchAssignedCompanies
      // IMPORTANT: Use the same query structure, ordering, limit, and user ID as the view
      const { data: assignedCompanies } = await supabase
        .from("companies")
        .select(`
          id,
          assigned_at,
          deletion_state,
          comments (
            id,
            comment_text,
            category,
            comment_date,
            created_at,
            user_id
          )
        `)
        .eq("assigned_to_id", countUserId) // Use the employee's ID (from user prop)
        .is("deleted_at", null)
        .order("assigned_at", { ascending: false, nullsFirst: false }) // Match view's ordering exactly
        .limit(100); // Match the view's limit to get accurate count

      let companyCount = 0;
      if (assignedCompanies) {
        const now = Date.now();
        const totalBeforeFilter = assignedCompanies.length;

        // Apply the exact same filtering logic as AssignedDataView.fetchAssignedCompanies
        // Step 1: Filter out companies with deletion_state
        let filteredData = assignedCompanies.filter((company: any) => !company.deletion_state);
        const afterDeletionStateFilter = filteredData.length;

        // Step 2: Filter out companies assigned for more than 24 hours
        // Match the view logic exactly - include companies without assigned_at
        const validCompanies: any[] = [];
        filteredData.forEach((company: any) => {
          if (!company.assigned_at) {
            // Include companies without assigned_at (matches view logic)
            validCompanies.push(company);
            return;
          }

          const assignedAt = new Date(company.assigned_at).getTime();
          const hoursSinceAssignment = (now - assignedAt) / (1000 * 60 * 60);
          if (hoursSinceAssignment < 24) {
            // Only include if within 24 hours
            validCompanies.push(company);
          }
          // Companies older than 24 hours are excluded (filtered out)
        });
        const afterTimeFilter = validCompanies.length;

        // Step 3: Sort comments the same way as the view does
        const companiesWithSortedComments = validCompanies.map((company) => ({
          ...company,
          comments:
            company.comments && company.comments.length > 0
              ? [...company.comments].sort(
                (a: any, b: any) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              )
              : [],
        }));

        // Step 4: For employees, filter out companies with comments (already categorized)
        // This matches AssignedDataView line 360-371 - employees see only uncategorized companies
        // Note: When team lead views employee dashboard, userRole is "employee", so this filter applies
        companyCount = companiesWithSortedComments.filter((company: any) => {
          // Logic: Company is considered "uncategorized" and stays in Assigned Data 
          // until a NEW comment is added AFTER the assignment time.
          const assignedAt = company.assigned_at ? new Date(company.assigned_at).getTime() : 0;
          const isWorkedOn = company.comments && company.comments.length > 0 && 
            new Date(company.comments[0].created_at).getTime() > assignedAt + 1000;
          return !isWorkedOn;
        }).length;

        console.log("📊 Assigned Data Count Calculation (Companies):", {
          totalBeforeFilter,
          afterDeletionStateFilter,
          afterTimeFilter,
          companyCount,
          filteredOutByTime: afterDeletionStateFilter - afterTimeFilter,
          filteredOutByComments: afterTimeFilter - companyCount,
          sampleCompanies: companiesWithSortedComments.slice(0, 5).map((c: any) => ({
            id: c.id,
            company_name: c.company_name,
            hasComments: c.comments && c.comments.length > 0,
            commentCount: c.comments?.length || 0
          }))
        });
      }

      let facebookAssignedCount = 0;
      let sharedFbIds: number[] = [];
      let shareDateMap: Record<number, string> = {};

      // Fetch Facebook data count (shared to employee, not yet worked on)
      const { data: sharesData } = await (supabase
        .from("facebook_data_shares" as any)
        .select("facebook_data_id, created_at")
        .eq("employee_id", user.id) as any);
      
      const shares = sharesData || [];

      if (shares && shares.length > 0) {
        sharedFbIds = (shares as any).map((s: any) => s.facebook_data_id);
        shares.forEach((s: any) => { if (s.created_at) shareDateMap[s.facebook_data_id] = s.created_at; });

        const { data: fbData } = await (supabase
          .from("facebook_data" as any)
          .select("id")
          .in("id", sharedFbIds) as any);

        if (fbData) {
          const { data: comments } = await (supabase
            .from("facebook_data_comments" as any)
            .select("facebook_data_id, created_at")
            .in("facebook_data_id", sharedFbIds) as any);

          const fbCommentsMap = new Map();
          (comments || []).forEach((c: any) => {
            if (!fbCommentsMap.has(c.facebook_data_id)) fbCommentsMap.set(c.facebook_data_id, []);
            fbCommentsMap.get(c.facebook_data_id).push(c);
          });

          facebookAssignedCount = fbData.filter((fb: any) => {
            const itemComments = fbCommentsMap.get(fb.id) || [];
            if (itemComments.length === 0) return true;
            
            // Sort to find latest
            const sortedComments = [...itemComments].sort((a: any, b: any) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            
            const sharedAt = shareDateMap[fb.id] ? new Date(shareDateMap[fb.id]).getTime() : 0;
            const latestCommentAt = new Date(sortedComments[0].created_at).getTime();
            
            // Keep in Assigned (Inbox) if not worked on
            const isWorkedOn = latestCommentAt > sharedAt + 1000;
            return !isWorkedOn;
          }).length;
        }
      }

      // Total Assigned = Companies + Facebook data in "Inbox" state
      counts.assigned = companyCount + facebookAssignedCount;
      // Use the same count for the facebook sidebar item
      counts.facebook = facebookAssignedCount;

      console.log("📊 Assigned Data Total Count:", {
        companyCount,
        facebookAssignedCount,
        total: counts.assigned
      });

      // Fetch today data count (companies/facebook data with comments from today)
      // Exclude inactive data (deletion_state='inactive' or latest comment is 'block')
      const today = new Date().toISOString().split('T')[0];

      const { data: todayCompanies } = await supabase
        .from("companies")
        .select(`
          id,
          deletion_state,
          comments (id, category, created_at)
        `)
        .eq("assigned_to_id", user.id)
        .is("deleted_at", null);

      let todayCount = 0;
      if (todayCompanies) {
        const todayCompaniesCount = todayCompanies.filter((company: any) => {
          // Exclude companies with deletion_state set (inactive or recycle bins)
          if (company.deletion_state) return false;

          if (!company.comments || company.comments.length === 0) return false;

          // Exclude companies where latest comment is 'block' category (moved to inactive)
          const sortedComments = [...company.comments].sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          const latestComment = sortedComments[0];
          if (latestComment && latestComment.category === 'block') {
            return false; // Exclude - it's in inactive section
          }

          return company.comments.some((comment: any) =>
            comment.created_at.startsWith(today)
          );
        }).length;
        todayCount += todayCompaniesCount;
      }

      if (shares && shares.length > 0) {
        const fbIds = shares.map((s: any) => s.facebook_data_id);

        // Fetch Facebook data with deletion_state
        const { data: fbData } = await (supabase
          .from("facebook_data" as any)
          .select("id, deletion_state")
          .in("id", fbIds) as any);

        // Fetch all comments for these Facebook data items
        const { data: allFbComments } = await (supabase
          .from("facebook_data_comments" as any)
          .select("facebook_data_id, category, created_at, user_id")
          .in("facebook_data_id", fbIds) as any);

        if (fbData && allFbComments) {
          // Group comments by facebook_data_id and get latest comment for each
          const fbLatestComments: Record<number, any> = {};
          allFbComments.forEach((comment: any) => {
            const fbId = comment.facebook_data_id;
            if (!fbLatestComments[fbId] ||
              new Date(comment.created_at) > new Date(fbLatestComments[fbId].created_at)) {
              fbLatestComments[fbId] = comment;
            }
          });

          // Filter Facebook data: exclude inactive and count only those with today's comments
          const activeFbIds = fbData
            .filter((fb: any) => {
              // Exclude items with deletion_state set (inactive or recycle bins)
              if (fb.deletion_state) return false;

              // Exclude items where latest comment is 'block' category (moved to inactive)
              const latestComment = fbLatestComments[fb.id];
              if (latestComment && latestComment.category === 'block') {
                return false; // Exclude - it's in inactive section
              }

              return true;
            })
            .map((fb: any) => fb.id);

          // Count only active Facebook data with comments from today
          const todayFbComments = allFbComments.filter((comment: any) =>
            activeFbIds.includes(comment.facebook_data_id) &&
            comment.created_at.startsWith(today)
          );

          const uniqueFbIds = new Set(todayFbComments.map((c: any) => c.facebook_data_id));
          todayCount += uniqueFbIds.size;
        }
      }
      counts.today = todayCount;

      // Fetch category counts (companies + facebook data with latest comment in each category)
      const categories = ['follow_up', 'hot', 'general'];

      for (const category of categories) {
        let categoryCount = 0;

        // Count companies with latest comment in this category
        // Match HotDataView query structure exactly (including ordering)
        const { data: categoryCompanies } = await supabase
          .from("companies")
          .select(`
            id,
            deletion_state,
            assigned_at,
            comments (id, category, created_at)
          `)
          .eq("assigned_to_id", user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(200); // Match HotDataView limit

        if (categoryCompanies) {
          // Filter out companies with deletion_state set (matches HotDataView logic)
          const activeCompanies = categoryCompanies.filter((company: any) => !company.deletion_state);

          // Filter companies where the latest comment has the matching category
          // Use reduce() to find latest comment (matches HotDataView's exact logic)
          const includedCompanyIds: string[] = [];
          const excludedCompanyIds: string[] = [];

          const categoryCompaniesCount = activeCompanies.filter((company: any) => {
            // Logic: Company belongs to aPool ONLY if it has been worked on (new comment since assignment)
            if (!company.comments || company.comments.length === 0) return false;

            const latestComment = company.comments.reduce((latest: any, current: any) => {
              if (!latest) return current;
              return new Date(current.created_at) > new Date(latest.created_at) ? current : latest;
            }, null);

            const assignedAt = company.assigned_at ? new Date(company.assigned_at).getTime() : 0;
            const isWorkedOn = latestComment && new Date(latestComment.created_at).getTime() > assignedAt + 1000;

            const matches = isWorkedOn && latestComment.category === category;
            return matches;
          }).length;

          if (category === 'hot') {
            // console.log(`[Prime Pool Count] Companies count: ${categoryCompaniesCount} (included: [${includedCompanyIds.join(', ')}], excluded: [${excludedCompanyIds.join(', ')}])`);
          }

          categoryCount += categoryCompaniesCount;
        }

        // Count Facebook data with latest comment in this category
        if (shares && shares.length > 0) {
          const fbIds = shares.map((s: any) => s.facebook_data_id);

          // Fetch Facebook data records to check deletion_state - MUST include all shared IDs
          const { data: fbDataRecords, error: fbDataError } = await (supabase
            .from("facebook_data" as any)
            .select("id, deletion_state, deleted_at")
            .in("id", fbIds) as any);

          if (fbDataError) {
            // console.warn(`Error fetching Facebook data for ${category} count:`, fbDataError);
          }

          // Create a map of facebook_data_id -> deletion_state/deleted_at status
          // Include ALL fbIds, marking missing ones as deleted (exclude from counts)
          const fbDeletionMap = new Map<number, { deletion_state: any; deleted_at: any; exists: boolean }>();

          // First, mark all shared IDs as not existing
          fbIds.forEach((id: number) => {
            fbDeletionMap.set(id, {
              deletion_state: null,
              deleted_at: null,
              exists: false
            });
          });

          // Then, update with actual records
          if (fbDataRecords) {
            fbDataRecords.forEach((fb: any) => {
              fbDeletionMap.set(fb.id, {
                deletion_state: fb.deletion_state,
                deleted_at: fb.deleted_at,
                exists: true
              });
            });
          }

          const { data: categoryFbComments } = await (supabase
            .from("facebook_data_comments" as any)
            .select("facebook_data_id, category, created_at")
            .in("facebook_data_id", fbIds) as any);

          if (categoryFbComments) {
            // Group by facebook_data_id and get latest comment for each
            const fbLatestComments: Record<number, any> = {};
            categoryFbComments.forEach((comment: any) => {
              const fbId = comment.facebook_data_id;
              if (!fbLatestComments[fbId] ||
                new Date(comment.created_at) > new Date(fbLatestComments[fbId].created_at)) {
                fbLatestComments[fbId] = comment;
              }
            });

            // Filter: only count Facebook data that:
            // 1. Has latest comment matching the category
            // 2. Does NOT have deletion_state set (not inactive/recycled)
            // 3. Does NOT have deleted_at set
            // 4. Actually exists in the database
            // This matches the exact filtering logic from HotDataView, FollowUpDataView, GeneralDataView
            const includedFbIds: number[] = [];
            const excludedFbIds: number[] = [];

            const categoryFbCount = Object.values(fbLatestComments).filter(
              (comment: any) => {
                // Must match category
                if (comment.category !== category) return false;

                // CRITICAL: Item only goes to category pools if it has been worked on (new comment since sharing)
                const fbId = comment.facebook_data_id;
                const sharedAt = shareDateMap[fbId] ? new Date(shareDateMap[fbId]).getTime() : 0;
                const latestCommentAt = new Date(comment.created_at).getTime();
                const isWorkedOn = latestCommentAt > sharedAt + 1000;

                if (!isWorkedOn) return false;

                // Check deletion status
                const fbDeletion = fbDeletionMap.get(fbId);
                if (!fbDeletion || !fbDeletion.exists) return false;
                if (fbDeletion.deletion_state || fbDeletion.deleted_at) return false;

                return true;
              }
            ).length;

            if (category === 'hot') {
              console.log(`[Prime Pool] Facebook data count: ${categoryFbCount} (included: [${includedFbIds.join(', ')}], excluded: [${excludedFbIds.join(', ')}])`);
            }

            categoryCount += categoryFbCount;
          }
        }

        // Map category to menu id
        const categoryMap: Record<string, string> = {
          'follow_up': 'followup',
          'hot': 'hot',
          'general': 'general'
        };

        if (category === 'hot') {
          console.log(`[Prime Pool] Total count (companies + Facebook): ${categoryCount}`);
        }

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
          assigned_at,
          comments (id, category, created_at, user_id)
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

          // Otherwise, check latest comment for block and if it's been worked on
          if (!company.comments || company.comments.length === 0) return false;
          const sortedComments = [...company.comments].sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          const latestComment = sortedComments[0];
          
          const assignedAt = company.assigned_at ? new Date(company.assigned_at).getTime() : 0;
          const isWorkedOn = latestComment && new Date(latestComment.created_at).getTime() > assignedAt + 1000;
          
          return isWorkedOn && latestComment.category === "block";
        }).length;
      }

      // Facebook data in inactive pool
      if (shares && shares.length > 0) {
        const fbIds = shares.map((s: any) => s.facebook_data_id);

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

            // Only consider this employee's own comments when determining block state
            const employeeComments = fbCommentList.filter((c: any) => c.user_id === user.id);
            if (employeeComments.length === 0) return false;

            const sortedComments = [...employeeComments].sort(
              (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            const latestComment = sortedComments[0];
            
            const sharedAt = shareDateMap[fb.id] ? new Date(shareDateMap[fb.id]).getTime() : 0;
            const latestCommentAt = new Date(latestComment.created_at).getTime();
            const isWorkedOn = latestCommentAt > sharedAt + 1000;
            
            return isWorkedOn && latestComment.category === "block";
          }).length;
        }
      }

      counts.block = blockCount;

      console.log("✅ Setting category counts:", counts);
      setCategoryCounts(counts);
    } catch (error) {
      console.error("Error fetching category counts:", error);
      // On error, reset counts to prevent showing stale data
      setCategoryCounts({ assigned: 0 });
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
        setUserName(user.email?.split("@")[0] || "Employee");
      }
    };

    fetchUserName();
  }, [user.id, user.email]);

  // Listen for data update events
  useEffect(() => {
    const handleDataUpdate = () => {
      fetchCategoryCounts();
    };

    const handleAssignedCountUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ count: number }>;
      if (customEvent.detail?.count !== undefined) {
        setCategoryCounts((prev) => ({
          ...prev,
          assigned: customEvent.detail.count,
        }));
      }
    };

    const handleBlockCountUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ count: number }>;
      if (customEvent.detail?.count !== undefined) {
        setCategoryCounts((prev) => ({
          ...prev,
          block: customEvent.detail.count,
        }));
      }
    };

    window.addEventListener('facebookDataUpdated', handleDataUpdate);
    window.addEventListener('companyDataUpdated', handleDataUpdate);
    window.addEventListener('assignedCountUpdated', handleAssignedCountUpdate);
    window.addEventListener('blockCountUpdated', handleBlockCountUpdate);

    return () => {
      window.removeEventListener('facebookDataUpdated', handleDataUpdate);
      window.removeEventListener('companyDataUpdated', handleDataUpdate);
      window.removeEventListener('assignedCountUpdated', handleAssignedCountUpdate);
      window.removeEventListener('blockCountUpdated', handleBlockCountUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const menuItems = [
    { id: "assigned", label: "Assigned Data", icon: LayoutDashboard, count: categoryCounts.assigned },
    { id: "facebook", label: "Facebook Data", icon: Share2, count: categoryCounts.facebook },
    { id: "search", label: "Search Data", icon: Search },
    { id: "today", label: "Today Data", icon: Calendar, count: categoryCounts.today },
    { id: "followup", label: "Active Pool", icon: TrendingUp, count: categoryCounts.followup },
    { id: "hot", label: "Prime Pool", icon: Flame, count: categoryCounts.hot },
    { id: "block", label: "Inactive Pool", icon: Ban, count: categoryCounts.block },
    { id: "general", label: "General Data", icon: Database, count: categoryCounts.general },
    { id: "add", label: "Add New Data", icon: Plus },
    { id: "request", label: "Request Data", icon: MessageSquarePlus },
  ];

  return (
    <DashboardLayout
      menuItems={menuItems}
      currentView={currentView}
      onViewChange={setCurrentView}
      user={user}
      userName={userName}
      onLogout={handleLogout}
    >
      {currentView === "assigned" && <AssignedDataView userId={user.id} userRole="employee" />}
      {currentView === "facebook" && <FacebookDataView userId={user.id} userRole="employee" />}
      {currentView === "search" && <SearchDataView userRole="employee" />}
      {currentView === "today" && <TodayDataView userId={user.id} userRole="employee" />}
      {currentView === "followup" && <FollowUpDataView userId={user.id} userRole="employee" />}
      {currentView === "hot" && <HotDataView userId={user.id} userRole="employee" />}
      {currentView === "block" && <BlockDataView userId={user.id} userRole="employee" />}
      {currentView === "general" && <GeneralDataView userId={user.id} userRole="employee" />}
      {currentView === "add" && <AddNewDataView userId={user.id} userRole="employee" />}
      {currentView === "request" && <RequestDataView userId={user.id} />}
    </DashboardLayout>
  );
};

export default EmployeeDashboard;
