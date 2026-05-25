import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Phone, Mail, MapPin, MessageSquare, Loader2, Calendar, User, DollarSign, CheckCircle2, ChevronDown, ChevronUp, FileCheck, Smile, Frown, Meh, MessageCircle, Search, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaidClientPoolViewProps {
  userRole?: string;
  defaultTab?: "all" | "completed" | "satisfied" | "dissatisfied" | "average" | "no-response";
  focusCompanyId?: string;
  focusOpenComments?: boolean;
  focusToken?: number;
}

const PaidClientPoolView = ({ userRole, defaultTab = "all", focusCompanyId, focusOpenComments, focusToken }: PaidClientPoolViewProps) => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [savingComments, setSavingComments] = useState<Record<string, boolean>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [seoNotes, setSeoNotes] = useState<Record<string, string>>({});
  const [sendingSeo, setSendingSeo] = useState<Record<string, boolean>>({});
  const [seoEmployees, setSeoEmployees] = useState<any[]>([]);
  const [seoEmployeesLoading, setSeoEmployeesLoading] = useState(false);
  const [seoAssignees, setSeoAssignees] = useState<Record<string, string>>({});
  const [seoFiles, setSeoFiles] = useState<Record<string, File | null>>({});
  const [seoTaskTypes, setSeoTaskTypes] = useState<Record<string, "seo" | "website">>({});
  const [savingSatisfaction, setSavingSatisfaction] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const [webSeoFilter, setWebSeoFilter] = useState<"all" | "seo" | "website">("all");
  const [highlightCompanyId, setHighlightCompanyId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const companyRefs = useRef<Record<string, HTMLDivElement | null>>({});

  type SatisfactionStatus = "satisfied" | "dissatisfied" | "average";

  // Satisfaction is stored in comment_text markers: "SATISFACTION_STATUS: satisfied|dissatisfied|average"
  // IMPORTANT: company.comments is sorted newest-first in fetchPaidClients(), so this returns the latest status.
  const getSatisfactionStatusForCompany = (company: any): SatisfactionStatus | null => {
    const markerComment = (company?.comments || []).find((c: any) =>
      typeof c?.comment_text === "string" && c.comment_text.includes("SATISFACTION_STATUS:")
    );
    if (!markerComment?.comment_text) return null;
    const text = markerComment.comment_text;
    if (text.includes("SATISFACTION_STATUS: satisfied")) return "satisfied";
    if (text.includes("SATISFACTION_STATUS: dissatisfied")) return "dissatisfied";
    if (text.includes("SATISFACTION_STATUS: average")) return "average";
    return null;
  };

  useEffect(() => {
    fetchPaidClients();
    
    // Load read notification IDs from localStorage (so unread count survives reloads)
    try {
      const stored = localStorage.getItem("paidlead_seo_notifications_read");
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        setReadNotificationIds(new Set(parsed));
      }
    } catch (err) {
      console.error("Failed to load read notification IDs:", err);
    }
    
    // Listen for company data updates (e.g., when a company is marked as paid)
    const handleDataUpdate = () => {
      fetchPaidClients();
    };
    
    // Listen for SEO task completion events
    const handleSeoTaskCompleted = () => {
      console.log('📢 PaidClientPoolView: SEO task completion event received');
      fetchPaidClients();
    };
    
    window.addEventListener('companyDataUpdated', handleDataUpdate);
    window.addEventListener('seoTaskCompleted', handleSeoTaskCompleted);
    
    // Subscribe to real-time updates for comments (including completion comments)
    const channel = supabase
      .channel('paid_clients_comments_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        console.log('📢 PaidClientPoolView: Comment change detected', payload);
        fetchPaidClients();
      })
      .subscribe();
    
    return () => {
      window.removeEventListener('companyDataUpdated', handleDataUpdate);
      window.removeEventListener('seoTaskCompleted', handleSeoTaskCompleted);
      supabase.removeChannel(channel);
    };
  }, []);

  // Load SEO / website employees (currently all employees; you can later filter by department)
  useEffect(() => {
    const fetchSeoEmployees = async () => {
      setSeoEmployeesLoading(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select(`
            id,
            display_name,
            email,
            user_roles: user_roles (role)
          `);

        if (error) throw error;

        const employees =
          data?.filter((p: any) =>
            p.user_roles?.some((r: any) => r.role === "employee")
          ) || [];

        setSeoEmployees(employees);
      } catch (err) {
        console.error("Error fetching SEO/website employees:", err);
      } finally {
        setSeoEmployeesLoading(false);
      }
    };

    fetchSeoEmployees();
  }, []);

  // Focus/highlight a company card (used when clicking notifications)
  // IMPORTANT: This hook must be declared before any early returns (like `if (loading) return ...`)
  useEffect(() => {
    if (!focusCompanyId || !focusToken) return;
    if (loading) return;

    // Open comments (best-effort)
    if (focusOpenComments) {
      setExpandedComments((prev) => ({ ...prev, [focusCompanyId]: true }));
    }

    // Highlight
    setHighlightCompanyId(focusCompanyId);
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightCompanyId(null);
    }, 6000);

    // Scroll into view after DOM updates
    window.setTimeout(() => {
      const el = companyRefs.current[focusCompanyId];
      if (el?.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200);
  }, [focusCompanyId, focusOpenComments, focusToken, loading]);

  const fetchPaidClients = async () => {
    setLoading(true);
    try {
      // First, try to fetch companies with is_paid = true
      // @ts-ignore - Supabase type inference issue with nested queries
      const { data: paidByField, error: paidByFieldError } = await (supabase
        .from("companies")
        .select(`
          *,
          assigned_to:profiles!assigned_to_id(display_name, email),
          comments (
            id,
            comment_text,
            category,
            comment_date,
            created_at,
            user_id,
            user:profiles!user_id (
              display_name,
              email
            )
          )
        `)
        .is("deleted_at", null)
        .eq("is_paid", true)
        .order("payment_date", { ascending: false }) as any);

      // Also fetch companies with "paid" comment category
      const { data: paidByComment, error: paidByCommentError } = await supabase
        .from("companies")
        .select(`
          *,
          assigned_to:profiles!assigned_to_id(display_name, email),
          comments (
            id,
            comment_text,
            category,
            comment_date,
            created_at,
            user_id,
            user:profiles!user_id (
              display_name,
              email
            )
          )
        `)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      // Also fetch companies that have SEO comments (for completed tasks section)
      const { data: seoCompanies, error: seoCompaniesError } = await supabase
        .from("companies")
        .select(`
          *,
          assigned_to:profiles!assigned_to_id(display_name, email),
          comments (
            id,
            comment_text,
            category,
            comment_date,
            created_at,
            user_id,
            user:profiles!user_id (
              display_name,
              email
            )
          )
        `)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      let allCompanies: any[] = [];
      
      // Handle is_paid field query
      if (!paidByFieldError && paidByField) {
        allCompanies = [...paidByField];
      } else if (paidByFieldError && (paidByFieldError.message?.includes("is_paid") || paidByFieldError.code === "PGRST204")) {
        // Column doesn't exist, skip this query
        console.warn("is_paid column doesn't exist, using comment-based filtering only");
      } else if (paidByFieldError) {
        throw paidByFieldError;
      }

      // Filter companies with "paid" comment category
      if (!paidByCommentError && paidByComment) {
        // Debug: Check a few companies to see their comments
        const sampleCompanies = paidByComment.slice(0, 5);
        sampleCompanies.forEach((company: any) => {
          if (company.comments && company.comments.length > 0) {
            console.log(`🔍 Sample company: ${company.company_name}`, {
              commentCount: company.comments.length,
              categories: company.comments.map((c: any) => c.category),
              allComments: company.comments
            });
          }
        });
        
        const companiesWithPaidComment = paidByComment.filter((company: any) => {
          // Check if any comment has category "paid"
          const hasPaidComment = company.comments?.some((comment: any) => {
            const matches = comment.category === "paid";
            if (matches) {
              console.log(`✅ Found paid comment in company: ${company.company_name}`, comment);
            }
            return matches;
          });
          return hasPaidComment;
        });
        
        console.log(`📊 Companies with paid comments: ${companiesWithPaidComment.length} out of ${paidByComment.length} total companies`);

        // Merge and deduplicate by company id
        const companyMap = new Map<string, any>();
        
        // Add companies from is_paid field
        allCompanies.forEach(company => {
          companyMap.set(company.id, company);
        });

        // Add companies from paid comments
        companiesWithPaidComment.forEach(company => {
          if (!companyMap.has(company.id)) {
            companyMap.set(company.id, company);
          }
        });

        // Add companies that have SEO comments (for completed tasks)
        if (!seoCompaniesError && seoCompanies) {
          const companiesWithSeoComments = seoCompanies.filter((company: any) => {
            // Check if company has any SEO category comments
            return company.comments?.some((comment: any) => comment.category === "seo");
          });
          
          console.log(`📋 Companies with SEO comments: ${companiesWithSeoComments.length}`);
          
          companiesWithSeoComments.forEach(company => {
            // Merge comments if company already exists, otherwise add it
            if (companyMap.has(company.id)) {
              const existing = companyMap.get(company.id);
              // Merge comments, avoiding duplicates
              const existingCommentIds = new Set(existing.comments?.map((c: any) => c.id) || []);
              const newComments = company.comments?.filter((c: any) => !existingCommentIds.has(c.id)) || [];
              existing.comments = [...(existing.comments || []), ...newComments];
            } else {
              companyMap.set(company.id, company);
            }
          });
        }

        allCompanies = Array.from(companyMap.values());
        
        // Sort by payment_date if available, otherwise by latest paid comment date
        allCompanies.sort((a, b) => {
          if (a.payment_date && b.payment_date) {
            return new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime();
          }
          if (a.payment_date) return -1;
          if (b.payment_date) return 1;
          
          // Sort by latest paid comment date
          const aPaidComment = a.comments?.find((c: any) => c.category === "paid");
          const bPaidComment = b.comments?.find((c: any) => c.category === "paid");
          if (aPaidComment && bPaidComment) {
            return new Date(bPaidComment.created_at).getTime() - new Date(aPaidComment.created_at).getTime();
          }
          return 0;
        });
      } else if (paidByCommentError) {
        throw paidByCommentError;
      }

      // Sort comments by created_at descending for each company
      const companiesWithSortedComments = allCompanies.map(company => ({
        ...company,
        comments: company.comments?.sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ) || []
      }));
      
      // Debug: Log companies with SEO completion comments
      const companiesWithCompletedSeoTasks = companiesWithSortedComments.filter((company) => {
        const completionComment = company.comments?.find((c: any) => 
          c.comment_text?.includes("TASK_COMPLETED:") && c.category === "seo"
        );
        if (completionComment) {
          console.log(`✅ Found completed SEO task for company: ${company.company_name}`, {
            companyId: company.id,
            completionComment: completionComment
          });
        }
        return !!completionComment;
      });
      
      console.log(`📊 Total companies fetched: ${companiesWithSortedComments.length}`);
      console.log(`✅ Companies with completed SEO tasks: ${companiesWithCompletedSeoTasks.length}`);
      
      console.log(`💰 Paid Client Pool: Displaying ${companiesWithSortedComments.length} paid companies`);
      console.log(`✅ Companies with completed SEO tasks: ${companiesWithCompletedSeoTasks.length}`);
      if (companiesWithCompletedSeoTasks.length > 0) {
        console.log("📋 Completed SEO tasks:", companiesWithCompletedSeoTasks.map(c => ({
          id: c.id,
          name: c.company_name,
          completionComment: c.comments?.find((c: any) => c.comment_text?.includes("TASK_COMPLETED:"))
        })));
      }
      
      setCompanies(companiesWithSortedComments);
    } catch (error: any) {
      console.error("Error fetching paid clients:", error);
      toast.error(error.message || "Failed to fetch paid clients");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (companyId: string) => {
    const commentText = commentTexts[companyId]?.trim();
    if (!commentText) {
      toast.error("Please enter a comment");
      return;
    }

    setSavingComments(prev => ({ ...prev, [companyId]: true }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("comments")
        .insert([
          {
            company_id: companyId,
            user_id: user.id,
            comment_text: commentText,
            category: "general",
            comment_date: new Date().toISOString(),
          },
        ]);

      if (error) throw error;

      // Clear the comment text for this company
      setCommentTexts(prev => {
        const newTexts = { ...prev };
        delete newTexts[companyId];
        return newTexts;
      });

      toast.success("Comment added successfully");
      fetchPaidClients(); // Refresh to show new comment
    } catch (error: any) {
      console.error("Error adding comment:", error);
      toast.error(error.message || "Failed to add comment");
    } finally {
      setSavingComments(prev => {
        const newSaving = { ...prev };
        delete newSaving[companyId];
        return newSaving;
      });
    }
  };

  // Send paid client details to SEO / website employee via a dedicated comment category "seo"
  const handleSendToSeo = async (companyId: string) => {
    const note = seoNotes[companyId]?.trim();
    if (!note) {
      toast.error("Please enter details to send");
      return;
    }

    const assigneeId = seoAssignees[companyId];
    if (!assigneeId) {
      toast.error("Please select an SEO / Website employee");
      return;
    }

    // Determine task type (SEO or Website). Default to 'seo' if not chosen.
    const taskType = seoTaskTypes[companyId] || "seo";

    setSendingSeo(prev => ({ ...prev, [companyId]: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let finalNote = note;

      // Attach selected SEO/Website employee info and task type
      const assignee = seoEmployees.find((e: any) => e.id === assigneeId);
      if (assignee) {
        finalNote += `\n\nSEO/Website Employee: ${assignee.display_name || assignee.email} (${assignee.email || assignee.id})`;
      }

      // Add a clear task type marker so dashboards can separate SEO vs Website work
      finalNote += `\nTASK_TYPE: ${taskType}`;

      // Upload optional attachment to Supabase storage (bucket: web_seo_uploads)
      const file = seoFiles[companyId] || null;
      if (file) {
        try {
          const path = `${companyId}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("web_seo_uploads")
            .upload(path, file);

          if (uploadError) {
            console.error("Error uploading SEO file:", uploadError);
            toast.error(
              uploadError.message?.includes("bucket")
                ? "Storage bucket 'web_seo_uploads' not found. Please create it in Supabase Storage."
                : "Failed to upload attachment. Sending details without file."
            );
          } else {
            const { data: publicUrlData } = supabase.storage
              .from("web_seo_uploads")
              .getPublicUrl(path);
            if (publicUrlData?.publicUrl) {
              finalNote += `\n\nAttachment: ${publicUrlData.publicUrl}`;
            }
          }
        } catch (uploadErr) {
          console.error("Unexpected error uploading SEO file:", uploadErr);
          toast.error("Failed to upload attachment. Sending details without file.");
        }
      }

      const { error } = await supabase
        .from("comments")
        .insert([
          {
            company_id: companyId,
            user_id: user.id,
            comment_text: finalNote,
            // Cast as any to allow custom 'seo' category even if not in generated enum types
            category: "seo" as any,
            comment_date: new Date().toISOString(),
          },
        ]);

      if (error) throw error;

      setSeoNotes(prev => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
      setSeoAssignees(prev => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
      setSeoFiles(prev => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });

      toast.success("Details sent to SEO / website team");
      fetchPaidClients();
    } catch (error: any) {
      console.error("Error sending details to SEO:", error);
      toast.error(error.message || "Failed to send details");
    } finally {
      setSendingSeo(prev => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
    }
  };

  const handleMarkSatisfaction = async (companyId: string, status: "satisfied" | "dissatisfied" | "average") => {
    setSavingSatisfaction(prev => ({ ...prev, [companyId]: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const satisfactionText = `SATISFACTION_STATUS: ${status}`;
      const nowIso = new Date().toISOString();

      // Always INSERT a new satisfaction marker comment.
      // Reason: UPDATE may fail due to RLS (if the existing row was created by someone else),
      // and UPDATE doesn't change created_at, which can cause "latest status" detection bugs.
      const { error } = await (supabase
        .from("comments")
        .insert([
          {
            company_id: companyId,
            user_id: user.id,
            comment_text: satisfactionText,
            // Keep this separate from SEO notifications and avoid impacting SEO flows
            category: "paid" as any,
            comment_date: nowIso,
          },
        ]) as any);

      if (error) throw error;

      // Optimistic UI update: prepend comment so filters update immediately.
      const optimisticComment = {
        id: `temp-satisfaction-${companyId}-${Date.now()}`,
        company_id: companyId,
        user_id: user.id,
        comment_text: satisfactionText,
        category: "paid",
        comment_date: nowIso,
        created_at: nowIso,
        user: { display_name: user.email?.split("@")[0] || "You", email: user.email },
      } as any;

      setCompanies((prev) =>
        prev.map((c) =>
          c.id === companyId
            ? {
                ...c,
                comments: [optimisticComment, ...(c.comments || [])],
              }
            : c
        )
      );

      toast.success(`Client marked as ${status}`);
      fetchPaidClients();
    } catch (error: any) {
      console.error("Error marking satisfaction:", error);
      toast.error(error.message || "Failed to mark satisfaction status");
    } finally {
      setSavingSatisfaction(prev => ({ ...prev, [companyId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Helper: determine task type (seo or website) for a company based on its SEO comments
  function getTaskTypeForCompany(company: any): "seo" | "website" | "unknown" {
    const seoComments = (company.comments || []).filter((c: any) => c.category === "seo");
    const typeComment = seoComments.find((c: any) => c.comment_text?.includes("TASK_TYPE:"));
    if (typeComment?.comment_text?.includes("TASK_TYPE: website")) return "website";
    if (typeComment?.comment_text?.includes("TASK_TYPE: seo")) return "seo";
    return "unknown";
  }

  // Separate companies into active and completed
  // Paid Clients section (defaultTab === "all"):
  //   - Should show ALL paid clients, regardless of SEO / Web completion status.
  //   - Sending a task to an employee or marking it completed must NOT remove the client.
  // Web/SEO section (defaultTab === "completed"):
  //   - Shows only clients with a completed SEO / Web task
  //     (clients that have a 'seo' category comment containing 'TASK_COMPLETED:').
  const activeCompanies = companies; // all paid companies stay visible in Paid Clients view

  const completedCompanies = companies.filter((company) => {
    const completionComment = company.comments?.find((c: any) => 
      c.category === "seo" && c.comment_text?.includes("TASK_COMPLETED:")
    );
    return !!completionComment;
  });

  // Completed SEO vs Website companies based on TASK_TYPE marker
  const completedSeoCompanies = completedCompanies.filter((company) => {
    const type = getTaskTypeForCompany(company);
    // Default to SEO if unknown (backward compatibility)
    return type === "seo" || type === "unknown";
  });

  const completedWebsiteCompanies = completedCompanies.filter((company) => {
    const type = getTaskTypeForCompany(company);
    return type === "website";
  });

  // Filter companies by satisfaction status
  const satisfiedCompanies = companies.filter((company) => getSatisfactionStatusForCompany(company) === "satisfied");
  const dissatisfiedCompanies = companies.filter((company) => getSatisfactionStatusForCompany(company) === "dissatisfied");
  const averageCompanies = companies.filter((company) => getSatisfactionStatusForCompany(company) === "average");
  const noResponseCompanies = companies.filter((company) => getSatisfactionStatusForCompany(company) === null);

  // Build SEO/Web notifications from comments (category 'seo') across all paid companies
  const seoNotifications = companies
    .flatMap((company) => {
      const seoComments = (company.comments || []).filter((c: any) => c.category === "seo");
      return seoComments.map((comment: any) => ({
        id: comment.id,
        companyId: company.id,
        companyName: company.company_name,
        text: comment.comment_text || "",
        created_at: comment.created_at || comment.comment_date,
        userName: comment.user?.display_name || comment.user?.email || "Unknown",
        taskType: comment.comment_text?.includes("TASK_TYPE: website")
          ? "website"
          : comment.comment_text?.includes("TASK_TYPE: seo")
          ? "seo"
          : "seo",
      }));
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50); // Limit to latest 50 notifications

  // Unread notifications are those whose IDs are not in readNotificationIds
  const unreadNotifications = seoNotifications.filter((n) => !readNotificationIds.has(n.id));

  // Determine displayed companies based on tab
  let displayedCompanies: any[] = [];
  if (defaultTab === "all") {
    displayedCompanies = activeCompanies;
  } else if (defaultTab === "completed") {
    if (webSeoFilter === "seo") {
      displayedCompanies = completedSeoCompanies;
    } else if (webSeoFilter === "website") {
      displayedCompanies = completedWebsiteCompanies;
    } else {
      displayedCompanies = completedCompanies;
    }
  } else if (defaultTab === "satisfied") {
    displayedCompanies = satisfiedCompanies;
  } else if (defaultTab === "dissatisfied") {
    displayedCompanies = dissatisfiedCompanies;
  } else if (defaultTab === "average") {
    displayedCompanies = averageCompanies;
  } else if (defaultTab === "no-response") {
    displayedCompanies = noResponseCompanies;
  }

  // Filter displayed companies by search query (company name, email, or phone)
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    // Remove all non-digit characters from query for phone number matching
    const queryDigitsOnly = query.replace(/\D/g, "");
    
    displayedCompanies = displayedCompanies.filter((company) => {
      const companyName = (company.company_name || "").toLowerCase();
      const email = (company.email || "").toLowerCase();
      const phone = (company.phone || "").replace(/\D/g, ""); // Remove all non-digit characters from phone
      
      // Check company name and email (case-insensitive partial match)
      const matchesName = companyName.includes(query);
      const matchesEmail = email.includes(query);
      
      // For phone number matching, be more strict to avoid false positives
      let matchesPhone = false;
      if (queryDigitsOnly.length > 0 && phone.length > 0) {
        // Only match if:
        // 1. Phone number exactly equals the query (after removing non-digits)
        // 2. OR query is at least 4 digits and phone number contains it as a complete sequence
        // This prevents short queries like "81" from matching "8000277772"
        if (phone === queryDigitsOnly) {
          matchesPhone = true; // Exact match
        } else if (queryDigitsOnly.length >= 4 && phone.includes(queryDigitsOnly)) {
          matchesPhone = true; // Partial match for longer queries (4+ digits)
        }
      }
      
      return matchesName || matchesEmail || matchesPhone;
    });
  }

  // Notification click → navigate + highlight
  const handleNotificationClick = (n: any) => {
    const isCompletion = typeof n?.text === "string" && n.text.includes("TASK_COMPLETED:");
    const targetView = isCompletion ? "web-seo" : "paid-clients";

    window.dispatchEvent(
      new CustomEvent("paidlead:navigate_to_company", {
        detail: {
          view: targetView,
          companyId: n.companyId,
          openComments: true,
        },
      })
    );

    setShowNotifications(false);
  };

  return (
    <div className="space-y-6 relative">
      {/* Notifications dropdown */}
      {showNotifications && (
        <div className="absolute right-0 top-0 mt-20 w-full max-w-md z-30">
          <Card className="bg-background/95 border border-white/10 shadow-2xl">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                SEO / Web Notifications
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-black/80 hover:text-white"
                onClick={() => setShowNotifications(false)}
              >
                Close
              </Button>
            </CardHeader>
            <CardContent className="pt-0 max-h-80 overflow-y-auto space-y-2">
              {seoNotifications.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No SEO / Web notifications yet. Activity from the SEO dashboard will appear here.
                </p>
              ) : (
                seoNotifications.map((n) => {
                  const isCompletion = n.text.includes("TASK_COMPLETED:");
                  const displayText = isCompletion
                    ? n.text.replace("TASK_COMPLETED:", "").trim() || "Task marked as completed."
                    : n.text;

                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className="w-full text-left rounded-md border border-white/10 bg-muted/40 p-2 text-xs space-y-1 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-white truncate">
                          {n.companyName}
                        </p>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] ${isCompletion ? "bg-green-600/80 text-white" : "bg-blue-600/80 text-white"}`}
                        >
                          {isCompletion ? "Task Completed" : "Comment"}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/50 line-clamp-2 break-words">
                        {displayText}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-white/50 mt-0.5">
                        <span className="truncate">By {n.userName}</span>
                        <span>
                          {new Date(n.created_at).toLocaleDateString()}{" "}
                          {new Date(n.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* Header for Paid Clients section */}
      {defaultTab === "all" && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <DollarSign className="h-8 w-8 text-primary" />
              Paid Client Pool
            </h2>
            <p className="text-muted-foreground mt-1 text-white">
              View and manage clients who have made payments
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Notifications bell - shows SEO/Web activity from comments */}
            <button
              type="button"
              onClick={() => {
                const nextVisible = !showNotifications;
                setShowNotifications(nextVisible);

                // When opening notifications, mark all as read so badge count clears
                if (!showNotifications && seoNotifications.length > 0) {
                  setReadNotificationIds((prev) => {
                    const next = new Set(prev);
                    seoNotifications.forEach((n) => next.add(n.id));
                    try {
                      localStorage.setItem(
                        "paidlead_seo_notifications_read",
                        JSON.stringify(Array.from(next))
                      );
                    } catch (err) {
                      console.error("Failed to persist read notification IDs:", err);
                    }
                    return next;
                  });
                }
              }}
              className="relative rounded-full p-2 bg-background/40 hover:bg-background/70 border border-white/10 text-white transition-colors"
            >
              <Bell className="h-5 w-5" />
              {unreadNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-0.5 rounded-full bg-red-500 text-[10px] font-semibold flex items-center justify-center text-white">
                  {unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}
                </span>
              )}
            </button>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {activeCompanies.length} {activeCompanies.length === 1 ? "Client" : "Clients"}
            </Badge>
          </div>
        </div>
      )}
      
      {/* Header for Web/SEO section */}
      {defaultTab === "completed" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                <FileCheck className="h-8 w-8 text-primary" />
                Completed Web/SEO Tasks
              </h2>
              <p className="text-muted-foreground mt-1 text-white">
                View all completed SEO and Website tasks sent from Paid Client Pool
              </p>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {completedCompanies.length} {completedCompanies.length === 1 ? "Task" : "Tasks"}
            </Badge>
          </div>

          {/* SEO vs Website filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/80">Show:</span>
            <Button
              size="sm"
              variant={webSeoFilter === "all" ? "default" : "outline"}
              className="h-7 text-xs px-2"
              onClick={() => setWebSeoFilter("all")}
            >
              All ({completedCompanies.length})
            </Button>
            <Button
              size="sm"
              variant={webSeoFilter === "seo" ? "default" : "outline"}
              className="h-7 text-xs px-2"
              onClick={() => setWebSeoFilter("seo")}
            >
              SEO ({completedSeoCompanies.length})
            </Button>
            <Button
              size="sm"
              variant={webSeoFilter === "website" ? "default" : "outline"}
              className="h-7 text-xs px-2"
              onClick={() => setWebSeoFilter("website")}
            >
              Website ({completedWebsiteCompanies.length})
            </Button>
          </div>
        </div>
      )}

      {/* Header for Satisfied section */}
      {defaultTab === "satisfied" && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Smile className="h-8 w-8 text-primary" />
              Satisfied Clients
            </h2>
            <p className="text-muted-foreground mt-1 text-white">
              Clients who are satisfied with the service
            </p>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {satisfiedCompanies.length} {satisfiedCompanies.length === 1 ? "Client" : "Clients"}
          </Badge>
        </div>
      )}

      {/* Header for Dissatisfied section */}
      {defaultTab === "dissatisfied" && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Frown className="h-8 w-8 text-primary" />
              Dissatisfied Clients
            </h2>
            <p className="text-muted-foreground mt-1 text-white">
              Clients who are dissatisfied with the service
            </p>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {dissatisfiedCompanies.length} {dissatisfiedCompanies.length === 1 ? "Client" : "Clients"}
          </Badge>
        </div>
      )}

      {/* Header for Average section */}
      {defaultTab === "average" && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Meh className="h-8 w-8 text-primary" />
              Average Clients
            </h2>
            <p className="text-muted-foreground mt-1 text-white">
              Clients with average satisfaction
            </p>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {averageCompanies.length} {averageCompanies.length === 1 ? "Client" : "Clients"}
          </Badge>
        </div>
      )}

      {/* Header for No Response section */}
      {defaultTab === "no-response" && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <MessageCircle className="h-8 w-8 text-primary" />
              No Response Clients
            </h2>
            <p className="text-muted-foreground mt-1 text-white">
              Clients who haven't provided feedback yet
            </p>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {noResponseCompanies.length} {noResponseCompanies.length === 1 ? "Client" : "Clients"}
          </Badge>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-2 text-white/50">
        <div className="relative flex-1 max-w-md ">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 " />
          <Input
            type="text"
            placeholder="Search by company name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 bg-background placeholder:text-white/50 border-2 focus:border-primary/50"
          />
        </div>
        {searchQuery.trim() && (
          <Badge variant="secondary" className="text-sm px-3 py-1.5">
            {displayedCompanies.length} {displayedCompanies.length === 1 ? "result" : "results"}
          </Badge>
        )}
      </div>

      {displayedCompanies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {defaultTab === "all" ? (
              <>
                <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-white mb-2">No Paid Clients</p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim() 
                    ? `No clients found matching "${searchQuery}". Try a different search term.`
                    : "No clients have been marked as paid yet. Mark clients as paid to see them here."}
                </p>
              </>
            ) : defaultTab === "completed" ? (
              <>
                <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-white mb-2">No Completed SEO Tasks</p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim() 
                    ? `No completed tasks found matching "${searchQuery}". Try a different search term.`
                    : "No SEO/Website tasks have been completed yet. Completed tasks will appear here."}
                </p>
              </>
            ) : (
              <>
                <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-white mb-2">No Results Found</p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim() 
                    ? `No clients found matching "${searchQuery}". Try a different search term.`
                    : `No clients found in this section.`}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {displayedCompanies.map((company) => {
            const lastComment = company.comments?.[0];
            const commentText = commentTexts[company.id] || "";
            const isSaving = savingComments[company.id] || false;
            
            // Find the paid comment to get who converted this company
            const paidComment = company.comments?.find((c: any) => c.category === "paid" && !c.comment_text?.includes("SATISFACTION_STATUS:"));
            const convertedByName = paidComment?.user?.display_name || paidComment?.user?.email || null;
            
            // Check for completion status - must be SEO category comment with TASK_COMPLETED
            const completionComment = company.comments?.find((c: any) => 
              c.category === "seo" && c.comment_text?.includes("TASK_COMPLETED:")
            );
            const isCompleted = !!completionComment;
            const completionNote = completionComment?.comment_text?.replace("TASK_COMPLETED:", "").trim();
            
            // Find SEO task assignment comment (the original task sent to SEO)
            const seoTaskComment = company.comments?.find((c: any) => 
              c.category === "seo" && !c.comment_text?.includes("TASK_COMPLETED:")
            );
            
            // Extract SEO employee info from task comment
            let seoEmployeeInfo = null;
            if (seoTaskComment?.comment_text) {
              const lines = seoTaskComment.comment_text.split("\n");
              const employeeLine = lines.find((line: string) => line.trim().startsWith("SEO/Website Employee:"));
              if (employeeLine) {
                seoEmployeeInfo = employeeLine.replace("SEO/Website Employee:", "").trim();
              }
            }
            
            // Extract attachment URL if exists
            let attachmentUrl = null;
            if (seoTaskComment?.comment_text) {
              const lines = seoTaskComment.comment_text.split("\n");
              const attachmentLine = lines.find((line: string) => line.trim().startsWith("Attachment:"));
              if (attachmentLine) {
                attachmentUrl = attachmentLine.replace("Attachment:", "").trim();
              }
            }

            // Get current satisfaction status
            const currentSatisfaction = getSatisfactionStatusForCompany(company);

            return (
              <div
                key={company.id}
                ref={(el) => {
                  companyRefs.current[company.id] = el;
                }}
              >
                <Card
                  className={cn(
                    "relative flex flex-col hover:shadow-xl transition-all duration-300 hover:scale-[1.02] border-2 hover:border-primary/50",
                    highlightCompanyId === company.id
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-2xl"
                      : ""
                  )}
                >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="flex items-center gap-2 text-white text-base font-bold">
                        <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="truncate text-xs text-muted-foreground">{company.company_name}</span>
                      </CardTitle>
                      {company.owner_name && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {company.owner_name}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <Badge className="bg-green-600 text-white flex items-center gap-1 text-xs px-2 py-0.5">
                        <CheckCircle2 className="h-3 w-3" />
                        Paid
                      </Badge>
                      {/* {isCompleted && (
                        <Badge className="bg-blue-600 text-white flex items-center gap-1 text-xs px-2 py-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                          SEO Done
                        </Badge>
                      )} */}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5 text-sm flex-1 flex flex-col pb-4">
                  <div className="space-y-1.5">
                    {company.phone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate text-xs">{company.phone}</span>
                      </div>
                    )}
                    {company.email && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate text-xs">{company.email}</span>
                      </div>
                    )}
                    {company.address && (
                      <div className="flex items-start gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-1 text-xs">{company.address}</span>
                      </div>
                    )}
                    {company.payment_date && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs">Paid: {new Date(company.payment_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {company.payment_amount && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs">${Number(company.payment_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {company.assigned_to && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs truncate">Assigned: {company.assigned_to.display_name}</span>
                      </div>
                    )}
                    {convertedByName && (
                      <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs truncate font-medium">Converted by: {convertedByName}</span>
                      </div>
                    )}
                  </div>

                  {/* SEO Task Assignment Info (shown prominently for completed tasks) */}
                  {defaultTab === "completed" && seoTaskComment && (
                    <div className="border-t pt-2 mt-2">
                      <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-md p-2 space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <FileCheck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
                              Web/SEO Task Details
                            </p>
                            {seoEmployeeInfo && (
                              <p className="text-[11px] text-purple-600 dark:text-purple-400 mb-1">
                                Assigned to: <span className="font-medium">{seoEmployeeInfo}</span>
                              </p>
                            )}
                            {seoTaskComment.created_at && (
                              <p className="text-[10px] text-purple-500 dark:text-purple-500">
                                Task sent: {new Date(seoTaskComment.created_at).toLocaleDateString()} {new Date(seoTaskComment.created_at).toLocaleTimeString()}
                              </p>
                            )}
                            {seoTaskComment.user && (
                              <p className="text-[10px] text-purple-500 dark:text-purple-500">
                                Sent by: {seoTaskComment.user.display_name || seoTaskComment.user.email || "Unknown"}
                              </p>
                            )}
                            {attachmentUrl && (
                              <div className="mt-1.5 pt-1.5 border-t border-purple-200 dark:border-purple-700">
                                <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                                  Attachment available
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SEO Completion Status */}
                  {isCompleted && (
                    <div className="border-t pt-2 mt-2">
                      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-2">
                        <div className="flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-0.5">
                              Task Completed
                            </p>
                            {completionNote && (
                              <p className="text-[11px] text-blue-600 dark:text-blue-400 whitespace-pre-wrap break-words line-clamp-3">
                                {completionNote}
                              </p>
                            )}
                            {completionComment?.user && (
                              <p className="text-[10px] text-blue-500 dark:text-blue-500 mt-1 truncate">
                                Completed by: {completionComment.user.display_name || completionComment.user.email || "Unknown"} ·{" "}
                                {new Date(completionComment.created_at).toLocaleDateString()} {new Date(completionComment.created_at).toLocaleTimeString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Comments Section */}
                  <div className="border-t pt-2 mt-2">
                    <button
                      onClick={() => {
                        setExpandedComments(prev => ({
                          ...prev,
                          [company.id]: !prev[company.id]
                        }));
                      }}
                      className="flex items-center justify-between w-full mb-1.5 hover:bg-muted/50 rounded p-1.5 -m-1.5 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        <p className="text-xs font-semibold text-black/80">
                          Comments
                        </p>
                        {company.comments && company.comments.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {company.comments.length}
                          </Badge>
                        )}
                      </div>
                      {company.comments && company.comments.length > 0 && (
                        expandedComments[company.id] ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )
                      )}
                    </button>
                    {expandedComments[company.id] && company.comments && company.comments.length > 0 && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto mt-1.5">
                        {company.comments.map((comment: any) => (
                          <div key={comment.id} className="bg-muted/50 p-2 rounded-md border border-muted">
                            {comment.comment_text ? (
                              <p className="text-xs text-foreground leading-relaxed mb-1.5 break-words font-medium line-clamp-3">
                                {comment.comment_text}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground italic mb-1.5">No comment text</p>
                            )}
                            <div className="text-muted-foreground text-[10px] space-y-0.5 border-t border-muted pt-1.5 mt-1.5">
                              <p>
                                <span className="font-medium text-foreground">{comment.user?.display_name || comment.user?.email || "Unknown"}</span>
                                {comment.user?.email && comment.user?.display_name && (
                                  <span className="text-muted-foreground/70"> ({comment.user.email})</span>
                                )}
                              </p>
                              <p className="text-muted-foreground/80">
                                {new Date(comment.created_at).toLocaleDateString()} {new Date(comment.created_at).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {expandedComments[company.id] && (!company.comments || company.comments.length === 0) && (
                      <p className="text-xs text-muted-foreground mt-1.5">No comments yet.</p>
                    )}
                  </div>

                  {/* Comment Input Box */}
                  <div className="border-t pt-2 mt-2 space-y-1.5">
                    <label className="text-xs font-semibold text-black/80 flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      Add Comment
                    </label>
                    <Textarea
                      placeholder="Type your comment here..."
                      value={commentText}
                      onChange={(e) =>
                        setCommentTexts((prev) => ({
                          ...prev,
                          [company.id]: e.target.value,
                        }))
                      }
                      className="min-h-[60px] max-h-[80px] text-xs resize-none bg-background text-white placeholder:text-white/60"
                      disabled={isSaving}
                    />
                    <Button
                      onClick={() => handleAddComment(company.id)}
                      disabled={!commentText.trim() || isSaving}
                      size="sm"
                      className="w-full h-7 text-xs"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="mr-2 h-3 w-3" />
                          Add Comment
                        </>
                    )}
                  </Button>
                  </div>

                  {/* Satisfaction Status Section - After Add Comment */}
                  {defaultTab === "all" && (
                    <div className="border-t pt-2 mt-2 space-y-1.5">
                      <label className="text-xs font-semibold flex items-center gap-1.5">
                        <Smile className="h-3.5 w-3.5 text-primary" />
                        Client Satisfaction
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 ">
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            "h-7 text-xs px-1.5 transition-all text-white/80",
                            currentSatisfaction === "satisfied" 
                              ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-md" 
                              : "hover:bg-green-50 dark:hover:bg-green-950 border-muted"
                          )}
                          onClick={() => handleMarkSatisfaction(company.id, "satisfied")}
                          disabled={savingSatisfaction[company.id]}
                        >
                          <Smile className={cn("h-3 w-3", currentSatisfaction === "satisfied" ? "mr-1" : "mr-0.5")} />
                          <span className="text-[10px]">Satisfied</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            "h-7 text-xs px-1.5 transition-all text-white/80",
                            currentSatisfaction === "average" 
                              ? "bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-600 shadow-md" 
                              : "hover:bg-yellow-50 dark:hover:bg-yellow-950 border-muted"
                          )}
                          onClick={() => handleMarkSatisfaction(company.id, "average")}
                          disabled={savingSatisfaction[company.id]}
                        >
                          <Meh className={cn("h-3 w-3", currentSatisfaction === "average" ? "mr-1" : "mr-0.5")} />
                          <span className="text-[10px]">Average</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            "h-7 text-xs px-1.5 transition-all text-white/80",
                            currentSatisfaction === "dissatisfied" 
                              ? "bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-md" 
                              : "hover:bg-red-50 dark:hover:bg-red-950 border-muted"
                          )}
                          onClick={() => handleMarkSatisfaction(company.id, "dissatisfied")}
                          disabled={savingSatisfaction[company.id]}
                        >
                          <Frown className={cn("h-3 w-3", currentSatisfaction === "dissatisfied" ? "mr-1" : "mr-0.5")} />
                          <span className="text-[10px]">Dissatisfied</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Send details to SEO / website - Only show for active (non-completed) tasks */}
                  {defaultTab === "all" && !isCompleted && (
                  <div className="border-t pt-2 mt-auto space-y-1.5">
                    <label className="text-xs font-semibold text-black/80 flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      Send to SEO / Website
                    </label>

                    {/* Select task type: SEO or Website */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">Task type</p>
                      <Select
                        value={seoTaskTypes[company.id] || "seo"}
                        onValueChange={(val) =>
                          setSeoTaskTypes((prev) => ({
                            ...prev,
                            [company.id]: val as "seo" | "website",
                          }))
                        }
                        disabled={sendingSeo[company.id]}
                      >
                        <SelectTrigger className="h-7 bg-background text-xs text-white border-white/20">
                          <SelectValue placeholder="Choose type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seo">SEO Task</SelectItem>
                          <SelectItem value="website">Website Task</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Select SEO / website employee */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">Select employee</p>
                      <Select
                        value={seoAssignees[company.id] || ""}
                        onValueChange={(val) =>
                          setSeoAssignees((prev) => ({
                            ...prev,
                            [company.id]: val,
                          }))
                        }
                        disabled={seoEmployeesLoading || sendingSeo[company.id]}
                      >
                        <SelectTrigger className="h-7 bg-background text-xs text-white border-white/20">
                          <SelectValue placeholder={seoEmployeesLoading ? "Loading..." : "Choose employee"} />
                        </SelectTrigger>
                        <SelectContent>
                          {seoEmployees.map((emp: any) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.display_name || emp.email} ({emp.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Optional attachment */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">Attach file (optional)</p>
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                        className="bg-background text-xs text-white border-white/20 file:text-xs file:bg-primary file:text-white h-7"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setSeoFiles((prev) => ({
                            ...prev,
                            [company.id]: file,
                          }));
                        }}
                        disabled={sendingSeo[company.id]}
                      />
                      {seoFiles[company.id] && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {seoFiles[company.id]?.name}
                        </p>
                      )}
                    </div>

                    <Textarea
                      placeholder="Include client details, requirements, URLs, and notes..."
                      value={seoNotes[company.id] || ""}
                      onChange={(e) =>
                        setSeoNotes((prev) => ({
                          ...prev,
                          [company.id]: e.target.value,
                        }))
                      }
                      className="min-h-[60px] max-h-[80px] text-xs resize-none bg-background text-white placeholder:text-white/60"
                      disabled={sendingSeo[company.id]}
                    />
                    <Button
                      onClick={() => handleSendToSeo(company.id)}
                      disabled={
                        sendingSeo[company.id] ||
                        !(seoNotes[company.id]?.trim()) ||
                        !seoAssignees[company.id]
                      }
                      size="sm"
                      className="w-full h-7 text-xs"
                    >
                      {sendingSeo[company.id] ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="mr-2 h-3 w-3" />
                          Send to SEO / Website
                        </>
                      )}
                    </Button>
                  </div>
                  )}
                </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PaidClientPoolView;


