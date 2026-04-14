import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Users, Building2, TrendingUp, Calendar, ChevronDown, ChevronRight, Eye, Phone, Mail, MapPin, MessageSquare, Clock, Ban, Share2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface EmployeeDataOverviewViewProps {
  userId: string;
}

interface TeamMember {
  id: string;
  display_name: string;
  email: string;
  company_count: number;
  companies: any[];
  facebook_data: any[];
  hot_data_count: number;
  follow_up_count: number;
  block_count: number;
  general_count: number;
  total_facebook_count: number;
  current_facebook_count: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const EmployeeDataOverviewView = ({ userId }: EmployeeDataOverviewViewProps) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [teamLeadData, setTeamLeadData] = useState<TeamMember | null>(null);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [selectedCompanyComments, setSelectedCompanyComments] = useState<any>(null);
  const [totalFacebookData, setTotalFacebookData] = useState(0);
  const [totalEmployeesWithData, setTotalEmployeesWithData] = useState(0);
  const [selectedStartDate, setSelectedStartDate] = useState<string>("");
  const [selectedEndDate, setSelectedEndDate] = useState<string>("");
  // Backward compatibility for any lingering references during hot reload
  const selectedDate = selectedStartDate;

  useEffect(() => {
    fetchTeamDataOverview();
  }, [userId, selectedStartDate, selectedEndDate]);

  const fetchTeamDataOverview = async () => {
    setLoading(true);

    try {
      // Get team information
      const { data: teamData } = await supabase
        .from("teams")
        .select("id, name")
        .eq("team_lead_id", userId)
        .single();

      if (!teamData) {
        setLoading(false);
        return;
      }

      // Get team members
      const { data: membersData } = await supabase
        .from("team_members")
        .select("*, employee:profiles!employee_id(*)")
        .eq("team_id", teamData.id);

      // Get team lead profile
      const { data: teamLeadProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      // Get all team member IDs (including team lead)
      const memberIds = [
        userId,
        ...(membersData || []).map((m) => m.employee_id)
      ];

      // Get all companies assigned to team members
      // Match HotDataView query exactly: exclude deleted_at, include deletion_state, same ordering and limit
      // Note: We can't use limit here because we need all companies for all employees, but we'll filter per employee
      const { data: companiesData } = await supabase
        .from("companies")
        .select(`
          *,
          comments (
            id,
            comment_text,
            category,
            created_at,
            user_id,
            user:profiles!user_id (
              display_name,
              email
            )
          )
        `)
        .in("assigned_to_id", memberIds)
        .is("deleted_at", null) // Match HotDataView: exclude soft-deleted companies
        .order("created_at", { ascending: true }); // Match HotDataView ordering

      // Get facebook shares for team members (to include FB counts like employee dashboard)
      const { data: fbSharesRaw } = await (supabase
        .from("facebook_data_shares" as any)
        .select("facebook_data_id, employee_id, created_at")
        .in("employee_id", memberIds) as any);

      // Apply date filter (from selectedStartDate to selectedEndDate) on shares
      const start = selectedStartDate ? new Date(selectedStartDate) : null;
      const end = selectedEndDate ? new Date(selectedEndDate) : new Date();
      if (end) {
        // set to end-of-day for inclusive filter
        end.setHours(23, 59, 59, 999);
      }
      const fbShares = fbSharesRaw?.filter((s: any) => {
        if (!start && !end) return true;
        if (!s.created_at) return false;
        const created = new Date(s.created_at);
        if (start && created < start) return false;
        if (end && created > end) return false;
        return true;
      });

      // Fetch full Facebook data records with comments
      let fbDataMap = new Map<number, any>();
      let fbLatestMap = new Map<number, any>();
      if (fbShares && fbShares.length > 0) {
        const fbIds = fbShares.map((s: any) => s.facebook_data_id);

        // Get Facebook data records (without embedded comments due to relationship issues)
        const { data: fbDataRecords, error: fbDataError } = await (supabase
          .from("facebook_data" as any)
          .select("*")
          .in("id", fbIds) as any);

        if (fbDataError) {
          console.error("Error fetching Facebook data records:", fbDataError);
          // Continue without Facebook data records if query fails
        } else if (fbDataRecords) {
          // Fetch comments separately for all Facebook data
          const { data: fbComments, error: fbCommentsError } = await (supabase
            .from("facebook_data_comments" as any)
            .select("facebook_data_id, id, comment_text, category, created_at, user_id")
            .in("facebook_data_id", fbIds) as any);

          if (fbCommentsError) {
            console.error("Error fetching Facebook comments:", fbCommentsError);
          }

          // Group comments by facebook_data_id
          const commentsByFbId = new Map<number, any[]>();
          if (fbComments) {
            fbComments.forEach((comment: any) => {
              if (!commentsByFbId.has(comment.facebook_data_id)) {
                commentsByFbId.set(comment.facebook_data_id, []);
              }
              commentsByFbId.get(comment.facebook_data_id)!.push(comment);
            });
          }

          // Process Facebook data records
          fbDataRecords.forEach((fbData: any) => {
            // Attach comments to Facebook data
            const comments = commentsByFbId.get(fbData.id) || [];
            const fbDataWithComments = { ...fbData, comments };

            fbDataMap.set(fbData.id, fbDataWithComments);

            // Find latest comment
            if (comments.length > 0) {
              const latestComment = [...comments].sort(
                (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )[0];
              fbLatestMap.set(fbData.id, latestComment);
            }
          });
        }
      }

      if (!companiesData) {
        setLoading(false);
        return;
      }

      // Apply date filter on companies (use assigned_at when available, fallback to created_at)
      const filteredCompanies = (companiesData || []).filter((c: any) => {
        if (!selectedStartDate && !selectedEndDate) return true;
        const startDate = selectedStartDate ? new Date(selectedStartDate) : null;
        const endDate = selectedEndDate ? new Date(selectedEndDate) : new Date();
        if (endDate) endDate.setHours(23, 59, 59, 999);

        const referenceDate = c.assigned_at ? new Date(c.assigned_at) : c.created_at ? new Date(c.created_at) : null;
        if (!referenceDate) return false;
        if (startDate && referenceDate < startDate) return false;
        if (endDate && referenceDate > endDate) return false;
        return true;
      });

      // Helper to get facebook data for an employee
      const getFbDataForEmployee = (employeeId: string) => {
        if (!fbShares) return { total: 0, latest: [], records: [] };
        const employeeFbShares = fbShares.filter((s: any) => s.employee_id === employeeId);
        const fbIds = employeeFbShares.map((s: any) => s.facebook_data_id);
        const latest = fbIds.map((id: number) => fbLatestMap.get(id)).filter(Boolean);
        const records = fbIds.map((id: number) => fbDataMap.get(id)).filter(Boolean);
        return { total: employeeFbShares.length, latest, records };
      };

      // Process team lead data
      // CRITICAL: Apply HotDataView limit (200 companies, oldest first) to match employee dashboard exactly
      const teamLeadCompanies = filteredCompanies
        .filter(c => c.assigned_to_id === userId)
        .slice(0, 200); // Match HotDataView limit: only first 200 companies (oldest first)
      console.log(`[EmployeeOverview] Team lead (${userId}) companies: ${teamLeadCompanies.length} total (limited to 200 like HotDataView)`);
      const teamLeadFbData = getFbDataForEmployee(userId);
      const teamLeadStats = calculateEmployeeStats(teamLeadCompanies, teamLeadProfile, teamLeadFbData.latest, teamLeadFbData.total, teamLeadFbData.records);
      console.log(`[EmployeeOverview] Team lead Prime Pool count: ${teamLeadStats.hot_data_count}`);
      setTeamLeadData(teamLeadStats);

      // Process team members data
      // CRITICAL: Apply HotDataView limit (200 companies, oldest first) to match employee dashboard exactly
      const membersWithStats = (membersData || []).map(member => {
        const memberCompanies = filteredCompanies
          .filter(c => c.assigned_to_id === member.employee_id)
          .slice(0, 200); // Match HotDataView limit: only first 200 companies (oldest first)
        console.log(`[EmployeeOverview] Employee ${member.employee_id} (${member.employee.email}) companies: ${memberCompanies.length} total (limited to 200 like HotDataView)`);
        const memberFbData = getFbDataForEmployee(member.employee_id);
        const stats = calculateEmployeeStats(memberCompanies, member.employee, memberFbData.latest, memberFbData.total, memberFbData.records);
        console.log(`[EmployeeOverview] Employee ${member.employee_id} Prime Pool count: ${stats.hot_data_count}`);
        return stats;
      });

      setTeamMembers(membersWithStats);
      setTotalCompanies(filteredCompanies.length);
      setTotalFacebookData(fbShares?.length || 0);

      // Employees with data in the date range (companies or fb shares)
      const employeesWithData = new Set<string>();
      filteredCompanies.forEach((c: any) => {
        if (c.assigned_to_id) employeesWithData.add(c.assigned_to_id);
      });
      (fbShares || []).forEach((s: any) => {
        if (s.employee_id) employeesWithData.add(s.employee_id);
      });
      // Include team lead if they have data
      setTotalEmployeesWithData(employeesWithData.size);

    } catch (error) {
      console.error("Error fetching team data overview:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMemberExpansion = (memberId: string) => {
    const newExpanded = new Set(expandedMembers);
    if (newExpanded.has(memberId)) {
      newExpanded.delete(memberId);
    } else {
      newExpanded.add(memberId);
    }
    setExpandedMembers(newExpanded);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'hot': return 'bg-red-100 text-red-800 border-red-200';
      case 'follow_up': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'block': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'general': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
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

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'hot': return 'Prime Pool';
      case 'follow_up': return 'Active Pool';
      case 'block': return 'Inactive Pool';
      case 'general': return 'General';
      default: return 'General';
    }
  };

  const groupCompaniesByCategory = (companies: any[], facebookData: any[] = []) => {
    const grouped: Record<string, any[]> = {
      hot: [],
      follow_up: [],
      block: [],
      general: [],
      current_facebook: [] // Uncategorized Facebook data
    };

    // Group companies
    companies.forEach((company) => {
      // Handle deletion_state for companies
      // Any deletion_state that contains "inactive" should move item exclusively to Inactive Pool
      if (company.deletion_state && String(company.deletion_state).toLowerCase().includes("inactive")) {
        grouped.block.push({ ...company, dataType: 'company' });
        return; // Don't include in any other pool
      }

      const latestComment = company.comments?.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      const category = latestComment?.category || 'general';
      grouped[category] = grouped[category] || [];
      grouped[category].push({ ...company, dataType: 'company' });
    });

    // Group Facebook data - filter out recycle bin items, include active and inactive
    facebookData.forEach((fbData) => {
      const deletionState = fbData.deletion_state;
      const deletedAt = fbData.deleted_at;

      // Exclude items moved to recycle bins (team_lead_recycle, admin_recycle)
      if (deletionState === "team_lead_recycle" || deletionState === "admin_recycle") {
        return; // Don't show recycle bin items in category views
      }

      // Items with any deletion_state containing 'inactive' go to block category only
      if (deletionState && String(deletionState).toLowerCase().includes("inactive")) {
        grouped.block.push({ ...fbData, dataType: 'facebook' });
        return;
      }

      // Exclude items with deleted_at
      if (deletedAt) {
        return;
      }

      // For active items, check latest comment category
      const latestComment = fbData.comments?.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      // If no comments, add to current_facebook (uncategorized)
      if (!latestComment) {
        grouped.current_facebook.push({ ...fbData, dataType: 'facebook' });
        return;
      }

      const category = latestComment.category || 'general';
      grouped[category] = grouped[category] || [];
      grouped[category].push({ ...fbData, dataType: 'facebook' });
    });

    return grouped;
  };

  const renderCompanyCard = (data: any) => {
    const isFacebookData = data.dataType === 'facebook';
    const latestComment = data.comments?.sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    const category = latestComment?.category || 'general';

    return (
      <Card key={`${isFacebookData ? 'fb' : 'company'}-${data.id}`} className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h5 className="font-medium text-sm">{isFacebookData ? data.name : data.company_name}</h5>
              {isFacebookData && (
                <Badge variant="secondary" className="text-xs bg-blue-500 text-white">
                  Facebook
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{isFacebookData ? (data.owner_name || data.company_name || '') : data.owner_name}</p>
          </div>
          <Badge className={`text-xs ${getCategoryColor(category)}`}>
            {getCategoryIcon(category)} {getCategoryName(category)}
          </Badge>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {data.phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              <span>{data.phone}</span>
            </div>
          )}
          {data.email && (
            <div className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              <span>{data.email}</span>
            </div>
          )}
          {data.address && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{data.address}</span>
            </div>
          )}
        </div>

        {(isFacebookData ? (data.products || data.services || data.business_description) : (data.products_services || data.products)) && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">
              <strong>Product:</strong> {isFacebookData ? (data.products || data.services || data.business_description) : (data.products_services || data.products)}
            </p>
          </div>
        )}

        {data.comments && data.comments.length > 0 && (
          <div className="mt-2">
            <div className="mb-2">
              <p className="font-medium text-xs">Latest Comment:</p>
              <div className="p-2 bg-gray-50 rounded text-xs">
                <p className="text-muted-foreground">{latestComment.comment_text}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(latestComment.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => setSelectedCompanyComments(data)}
                  >
                    <MessageSquare className="h-3 w-3 mr-1" />
                    View All Comments ({data.comments.length})
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Comments for {isFacebookData ? data.name : data.company_name}
                    </DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="h-[60vh] pr-4">
                    <div className="space-y-4">
                      {data.comments
                        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        .map((comment: any) => (
                          <Card key={comment.id} className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-medium text-blue-600">
                                    {comment.user?.display_name?.charAt(0) || 'U'}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-sm">
                                    {comment.user?.display_name || 'Unknown User'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {comment.user?.email}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={`text-xs ${getCategoryColor(comment.category)}`}>
                                  {getCategoryIcon(comment.category)} {getCategoryName(comment.category)}
                                </Badge>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {new Date(comment.created_at).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {comment.comment_text}
                            </p>
                          </Card>
                        ))}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}
      </Card>
    );
  };

  const calculateEmployeeStats = (companies: any[], profile: any, fbLatest: any[] = [], totalFbCount: number = 0, fbRecords: any[] = []): TeamMember => {
    let hotDataCount = 0;
    let followUpCount = 0;
    let blockCount = 0;

    companies.forEach((company) => {
      // CRITICAL: Exclude ALL companies with deletion_state set (matches HotDataView, FollowUpDataView, etc.)
      // Only companies with deletion_state='inactive' should go to block/inactive pool
      // Other deletion_state values (team_lead_recycle, admin_recycle) should be excluded from all category counts
      if (company.deletion_state) {
        console.log(`[EmployeeOverview] Excluding company ${company.id} from Prime Pool: deletion_state=${company.deletion_state}`);
        if (company.deletion_state === "inactive") {
          blockCount += 1;
        }
        // Exclude from all other categories (hot, follow_up, general)
        return;
      }

      // Also check deleted_at (should be filtered at query level, but double-check)
      if (company.deleted_at) {
        console.log(`[EmployeeOverview] Excluding company ${company.id} from Prime Pool: deleted_at=${company.deleted_at}`);
        return;
      }

      // Use reduce() to find latest comment (matches HotDataView logic exactly)
      const latestComment = company.comments && company.comments.length > 0
        ? company.comments.reduce((latest: any, current: any) => {
          if (!latest) return current;
          return new Date(current.created_at) > new Date(latest.created_at) ? current : latest;
        }, null)
        : null;
      const category = latestComment?.category || null;
      if (category === "hot") {
        hotDataCount += 1;
        console.log(`[EmployeeOverview] Including company ${company.id} in Prime Pool: assigned_to=${company.assigned_to_id}, latest comment category=hot, created_at=${latestComment.created_at}, all_comments=${company.comments?.map((c: any) => `${c.category}@${c.created_at}`).join(', ') || 'none'}`);
      } else if (category === "follow_up") {
        followUpCount += 1;
      } else if (category === "block") {
        blockCount += 1;
      }
      // general handled after via remainder
    });

    // Include Facebook data latest categories (mirror EmployeeDashboard category counts)
    // Build a quick lookup for facebook_data records to check deletion_state
    const fbRecordById = new Map<number, any>();
    fbRecords.forEach((fb: any) => {
      fbRecordById.set(fb.id, fb);
    });

    const fbHot = fbLatest.filter((c: any) => {
      if (!c || c.category !== "hot") return false;
      const fb = fbRecordById.get(c.facebook_data_id);
      // Exclude deleted/inactive/recycle items from Prime count
      return !fb?.deletion_state;
    }).length;

    const fbFollowUp = fbLatest.filter((c: any) => {
      if (!c || c.category !== "follow_up") return false;
      const fb = fbRecordById.get(c.facebook_data_id);
      return !fb?.deletion_state;
    }).length;

    const fbBlock = fbLatest.filter((c: any) => {
      if (!c || c.category !== "block") return false;
      const fb = fbRecordById.get(c.facebook_data_id);
      // Block pool should include only inactive (or block) items
      return !!fb?.deletion_state;
    }).length;

    hotDataCount += fbHot;
    followUpCount += fbFollowUp;
    blockCount += fbBlock;

    const generalCount =
      companies.filter((company) => {
        // CRITICAL: Exclude ALL companies with deletion_state set (matches other views)
        if (company.deletion_state) return false;
        if (!company.comments || company.comments.length === 0) return false; // only current (categorized) data
        // Use reduce() to find latest comment (matches HotDataView logic exactly)
        const latestComment = company.comments.reduce((latest: any, current: any) => {
          if (!latest) return current;
          return new Date(current.created_at) > new Date(latest.created_at) ? current : latest;
        }, null);
        return latestComment?.category === "general";
      }).length +
      fbLatest.filter((c: any) => {
        // Also exclude Facebook data with deletion_state from general count
        if (!c || c.category !== "general") return false;
        const fb = fbRecordById.get(c.facebook_data_id);
        return !fb?.deletion_state;
      }).length;

    // Calculate current Facebook count
    // Current = active Facebook data WITHOUT comments (uncategorized)
    // This matches the EmployeeDashboard Facebook Data section logic
    // Filter out any with deletion_state or deleted_at set (inactive, recycle bins)
    // AND filter out items that have comments (categorized items are shown in category views)
    const currentFbCount = fbRecords.filter((fb: any) => {
      const deletionState = (fb as any).deletion_state;
      const deletedAt = (fb as any).deleted_at;
      // Exclude items with deletion_state or deleted_at (inactive, recycle bins)
      if (deletionState || deletedAt) return false;
      // Only count items without comments (uncategorized) - matching EmployeeDashboard logic
      const hasComments = fb.comments && fb.comments.length > 0;
      return !hasComments;
    }).length;

    return {
      id: profile.id,
      display_name: profile.display_name,
      email: profile.email,
      company_count: hotDataCount + followUpCount + blockCount + generalCount,
      companies: companies,
      facebook_data: fbRecords,
      hot_data_count: hotDataCount,
      follow_up_count: followUpCount,
      block_count: blockCount,
      general_count: generalCount,
      total_facebook_count: totalFbCount,
      current_facebook_count: currentFbCount,
    };
  };

  const prepareChartData = () => {
    const chartData = [];

    if (teamLeadData) {
      chartData.push({
        name: teamLeadData.display_name,
        total: teamLeadData.company_count,
        hot: teamLeadData.hot_data_count,
        followUp: teamLeadData.follow_up_count,
        block: teamLeadData.block_count,
        general: teamLeadData.general_count,
        isTeamLead: true
      });
    }

    teamMembers.forEach(member => {
      chartData.push({
        name: member.display_name,
        total: member.company_count,
        hot: member.hot_data_count,
        followUp: member.follow_up_count,
        block: member.block_count,
        general: member.general_count,
        isTeamLead: false
      });
    });

    return chartData;
  };

  const preparePieData = () => {
    const pieData = [
      { name: 'Prime Pool', value: (teamLeadData?.hot_data_count || 0) + teamMembers.reduce((sum, m) => sum + m.hot_data_count, 0) },
      { name: 'Active Pool', value: (teamLeadData?.follow_up_count || 0) + teamMembers.reduce((sum, m) => sum + m.follow_up_count, 0) },
      { name: 'Inactive Pool', value: (teamLeadData?.block_count || 0) + teamMembers.reduce((sum, m) => sum + m.block_count, 0) },
      { name: 'General', value: (teamLeadData?.general_count || 0) + teamMembers.reduce((sum, m) => sum + m.general_count, 0) },
    ];
    return pieData.filter(item => item.value > 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const chartData = prepareChartData();
  const pieData = preparePieData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-bold text-white">Team Data Overview</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-white">
            <Building2 className="h-4 w-4" />
            <span>Total Companies: {totalCompanies}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-white/80">From date</label>
            <Input
              type="date"
              value={selectedStartDate}
              onChange={(e) => setSelectedStartDate(e.target.value)}
              className="bg-white/10 text-white border-white/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-white/80">To date</label>
            <Input
              type="date"
              value={selectedEndDate}
              onChange={(e) => setSelectedEndDate(e.target.value)}
              className="bg-white/10 text-white border-white/20"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employees (date range)</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {selectedStartDate || selectedEndDate ? totalEmployeesWithData : teamMembers.length + (teamLeadData ? 1 : 0)}
            </div>
            {(selectedStartDate || selectedEndDate) && (
              <p className="text-xs text-muted-foreground mt-1">
                Employees with activity{selectedStartDate ? ` since ${selectedStartDate}` : ""}{selectedEndDate ? ` up to ${selectedEndDate}` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCompanies}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prime Pool</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(teamLeadData?.hot_data_count || 0) + teamMembers.reduce((sum, m) => sum + m.hot_data_count, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Pool</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(teamLeadData?.follow_up_count || 0) + teamMembers.reduce((sum, m) => sum + m.follow_up_count, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Pool</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(teamLeadData?.block_count || 0) + teamMembers.reduce((sum, m) => sum + m.block_count, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Facebook Data</CardTitle>
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFacebookData}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Companies per Team Member</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Team Member Data */}
      <Card>
        <CardHeader>
          <CardTitle>Team Member Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Team Lead */}
            {teamLeadData && (
              <div className="border rounded-lg p-4 bg-blue-50">
                <Collapsible
                  open={expandedMembers.has(teamLeadData.id)}
                  onOpenChange={(open) => {
                    if (open) {
                      setExpandedMembers(prev => new Set(prev).add(teamLeadData.id));
                    } else {
                      setExpandedMembers(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(teamLeadData.id);
                        return newSet;
                      });
                    }
                  }}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between mb-3 cursor-pointer hover:bg-blue-100 p-2 rounded">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{teamLeadData.display_name}</h3>
                        <Badge variant="secondary">Team Lead</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-muted-foreground">
                          {teamLeadData.email}
                        </div>
                        {expandedMembers.has(teamLeadData.id) ?
                          <ChevronDown className="h-4 w-4" /> :
                          <ChevronRight className="h-4 w-4" />
                        }
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{teamLeadData.company_count}</div>
                      <div className="text-sm text-muted-foreground">Total Companies</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{teamLeadData.hot_data_count}</div>
                      <div className="text-sm text-muted-foreground">Prime Pool</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{teamLeadData.follow_up_count}</div>
                      <div className="text-sm text-muted-foreground">Active Pool</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-600">{teamLeadData.block_count}</div>
                      <div className="text-sm text-muted-foreground">Inactive Pool</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{teamLeadData.general_count}</div>
                      <div className="text-sm text-muted-foreground">General</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{teamLeadData.total_facebook_count}</div>
                      <div className="text-sm text-muted-foreground">Total Facebook</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-indigo-600">{teamLeadData.current_facebook_count}</div>
                      <div className="text-sm text-muted-foreground">Current Facebook</div>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="space-y-3">
                      {teamLeadData.companies.length === 0 && (teamLeadData.facebook_data?.length || 0) === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No data assigned</p>
                      ) : (
                        <Tabs defaultValue="prime" className="w-full">
                          <TabsList className="grid w-full grid-cols-5">
                            <TabsTrigger value="prime">Prime Pool ({teamLeadData.hot_data_count})</TabsTrigger>
                            <TabsTrigger value="active">Active Pool ({teamLeadData.follow_up_count})</TabsTrigger>
                            <TabsTrigger value="block">Inactive Pool ({teamLeadData.block_count})</TabsTrigger>
                            <TabsTrigger value="general">General ({teamLeadData.general_count})</TabsTrigger>
                            <TabsTrigger value="current_facebook">Current Facebook ({teamLeadData.current_facebook_count})</TabsTrigger>
                          </TabsList>

                          {(() => {
                            const grouped = groupCompaniesByCategory(teamLeadData.companies, teamLeadData.facebook_data || []);
                            return (
                              <>
                                <TabsContent value="prime" className="mt-4">
                                  {grouped.hot.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No data in Prime Pool</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.hot.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>

                                <TabsContent value="active" className="mt-4">
                                  {grouped.follow_up.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No data in Active Pool</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.follow_up.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>

                                <TabsContent value="block" className="mt-4">
                                  {grouped.block.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No data in Inactive Pool</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.block.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>

                                <TabsContent value="general" className="mt-4">
                                  {grouped.general.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No data in General</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.general.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>

                                <TabsContent value="current_facebook" className="mt-4">
                                  {grouped.current_facebook.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No current Facebook data</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.current_facebook.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>
                              </>
                            );
                          })()}
                        </Tabs>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {/* Team Members */}
            {teamMembers.map((member) => (
              <div key={member.id} className="border rounded-lg p-4">
                <Collapsible
                  open={expandedMembers.has(member.id)}
                  onOpenChange={(open) => {
                    if (open) {
                      setExpandedMembers(prev => new Set(prev).add(member.id));
                    } else {
                      setExpandedMembers(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(member.id);
                        return newSet;
                      });
                    }
                  }}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between mb-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{member.display_name}</h3>
                        <Badge variant="outline">Team Member</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-muted-foreground">
                          {member.email}
                        </div>
                        {expandedMembers.has(member.id) ?
                          <ChevronDown className="h-4 w-4" /> :
                          <ChevronRight className="h-4 w-4" />
                        }
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{member.company_count}</div>
                      <div className="text-sm text-muted-foreground">Total Companies</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{member.hot_data_count}</div>
                      <div className="text-sm text-muted-foreground">Prime Pool</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{member.follow_up_count}</div>
                      <div className="text-sm text-muted-foreground">Active Pool</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-600">{member.block_count}</div>
                      <div className="text-sm text-muted-foreground">Inactive Pool</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{member.general_count}</div>
                      <div className="text-sm text-muted-foreground">General</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{member.total_facebook_count}</div>
                      <div className="text-sm text-muted-foreground">Total Facebook</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-indigo-600">{member.current_facebook_count}</div>
                      <div className="text-sm text-muted-foreground">Current Facebook</div>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="space-y-3">
                      {member.companies.length === 0 && (member.facebook_data?.length || 0) === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No data assigned</p>
                      ) : (
                        <Tabs defaultValue="prime" className="w-full">
                          <TabsList className="grid w-full grid-cols-5">
                            <TabsTrigger value="prime">Prime Pool ({member.hot_data_count})</TabsTrigger>
                            <TabsTrigger value="active">Active Pool ({member.follow_up_count})</TabsTrigger>
                            <TabsTrigger value="block">Inactive Pool ({member.block_count})</TabsTrigger>
                            <TabsTrigger value="general">General ({member.general_count})</TabsTrigger>
                            <TabsTrigger value="current_facebook">Current Facebook ({member.current_facebook_count})</TabsTrigger>
                          </TabsList>

                          {(() => {
                            const grouped = groupCompaniesByCategory(member.companies, member.facebook_data || []);
                            return (
                              <>
                                <TabsContent value="prime" className="mt-4">
                                  {grouped.hot.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No data in Prime Pool</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.hot.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>

                                <TabsContent value="active" className="mt-4">
                                  {grouped.follow_up.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No data in Active Pool</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.follow_up.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>

                                <TabsContent value="block" className="mt-4">
                                  {grouped.block.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No data in Inactive Pool</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.block.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>

                                <TabsContent value="general" className="mt-4">
                                  {grouped.general.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No data in General</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.general.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>

                                <TabsContent value="current_facebook" className="mt-4">
                                  {grouped.current_facebook.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic text-center py-4">No current Facebook data</p>
                                  ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {grouped.current_facebook.map((company: any) => renderCompanyCard(company))}
                                    </div>
                                  )}
                                </TabsContent>
                              </>
                            );
                          })()}
                        </Tabs>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}

            {teamMembers.length === 0 && !teamLeadData && (
              <div className="text-center py-8 text-muted-foreground">
                No team data available.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeDataOverviewView;
