import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Building2, Phone, Mail, MapPin, MessageSquare, Trash2, Clock, Loader2, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyCardProps {
  company: any;
  onUpdate: () => void;
  canDelete?: boolean;
  showAssignedTo?: boolean;
  userRole?: string;
  hideCategory?: boolean;
  customFooter?: React.ReactNode;
}

// Map database category names to display names
const mapDbCategoryToDisplay = (dbCategory: string): string => {
  const mapping: Record<string, string> = {
    "hot": "prime",
    "follow_up": "active",
    "block": "inactive",
    "general": "general",
    "paid": "paid",
    // Also handle if already in display format
    "prime": "prime",
    "active": "active",
    "inactive": "inactive"
  };
  return mapping[dbCategory] || dbCategory;
};

// Map display category names to database names
const mapDisplayCategoryToDb = (displayCategory: string): string => {
  const mapping: Record<string, string> = {
    "prime": "hot",
    "active": "follow_up",
    "inactive": "block",
    "general": "general",
    "paid": "paid"
  };
  return mapping[displayCategory] || displayCategory;
};

const categoryColors = {
  prime: "bg-[hsl(var(--hot))] text-[hsl(var(--hot-foreground))]",
  active: "bg-[hsl(var(--follow-up))] text-[hsl(var(--follow-up-foreground))]",
  inactive: "bg-[hsl(var(--block))] text-[hsl(var(--block-foreground))]",
  general: "bg-[hsl(var(--general))] text-[hsl(var(--general-foreground))]",
  // Keep old names for backward compatibility
  hot: "bg-[hsl(var(--hot))] text-[hsl(var(--hot-foreground))]",
  follow_up: "bg-[hsl(var(--follow-up))] text-[hsl(var(--follow-up-foreground))]",
  block: "bg-[hsl(var(--block))] text-[hsl(var(--block-foreground))]",
};

const getCategoryIcon = (category: string) => {
  const displayCategory = mapDbCategoryToDisplay(category);
  switch (displayCategory) {
    case 'prime': return '🔥';
    case 'active': return '📅';
    case 'inactive': return '🚫';
    case 'general': return '📋';
    case 'paid': return '💰';
    default: return '📄';
  }
};

const getCategoryDisplayName = (category: string): string => {
  const displayCategory = mapDbCategoryToDisplay(category);
  switch (displayCategory) {
    case 'prime': return 'Prime Pool';
    case 'active': return 'Active Pool';
    case 'inactive': return 'Inactive Pool';
    case 'general': return 'General Data';
    case 'paid': return 'Paid';
    default: return displayCategory.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'prime': return 'bg-red-100 text-red-800 border-red-200';
    case 'active': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'general': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-blue-100 text-blue-800 border-blue-200';
  }
};

const CompanyCard = ({ company, onUpdate, canDelete, showAssignedTo, userRole, hideCategory, customFooter }: CompanyCardProps) => {
  const [commentText, setCommentText] = useState("");
  const [category, setCategory] = useState("general");
  const [commentDate, setCommentDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const lastComment = company.comments?.[0];

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      // When dialog opens, set category to last comment's category (mapped to display name) or default to general
      if (lastComment?.category) {
        setCategory(mapDbCategoryToDisplay(lastComment.category));
      } else {
        setCategory("general");
      }
      setCommentText("");
      setCommentDate("");
    } else {
      // Reset when dialog closes
      setCommentText("");
      setCommentDate("");
      // Keep category as last comment's category (mapped to display name) for next time
      if (lastComment?.category) {
        setCategory(mapDbCategoryToDisplay(lastComment.category));
      } else {
        setCategory("general");
      }
    }
  }, [open, lastComment?.category]);

  const handleAddComment = async () => {
    if (!commentText.trim()) {
      toast.error("Please enter a comment");
      return;
    }

    // For employees, date is mandatory
    if (userRole !== "admin" && !commentDate) {
      toast.error("Please select a date for your comment");
      return;
    }

    // Validate category
    const validCategories = ["active", "prime", "inactive", "general", "paid"];
    if (!validCategories.includes(category)) {
      toast.error("Please select a valid category");
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      // Check if category is changing (compare display names)
      const lastCommentDisplayCategory = lastComment?.category ? mapDbCategoryToDisplay(lastComment.category) : null;
      const isCategoryChanging = lastCommentDisplayCategory && lastCommentDisplayCategory !== category;

      // Map display category name to database category name
      const commentCategory = mapDisplayCategoryToDb(category) as "hot" | "follow_up" | "block" | "general" | "paid";

      const { error } = await supabase.from("comments").insert([
        {
          company_id: company.id,
          user_id: userData.user?.id,
          comment_text: commentText.trim(),
          category: commentCategory,
          comment_date: commentDate || null,
        },
      ]);

      if (error) {
        console.error("Error adding comment:", error);
        console.error("Full error details:", JSON.stringify(error, null, 2));

        // Check if it's because "paid" category doesn't exist in enum
        if (category === "paid" && (error.message?.includes("paid") || error.message?.includes("invalid input value") || error.code === "PGRST116")) {
          toast.error(
            "The 'paid' category is not available yet. Please run the migration: ADD_PAID_TO_COMMENT_CATEGORY.sql in Supabase SQL Editor.",
            { duration: 10000 }
          );
          console.error("Migration required. Run: ADD_PAID_TO_COMMENT_CATEGORY.sql");
          return;
        }

        throw error;
      }

      // If category is "paid", also update the company's is_paid field
      if (category === "paid") {
        const { error: updateError } = await supabase
          .from("companies")
          .update({
            is_paid: true,
            payment_date: commentDate ? new Date(commentDate).toISOString() : new Date().toISOString()
          })
          .eq("id", company.id);

        if (updateError) {
          // Log error but don't fail the comment insertion
          console.warn("Could not update is_paid field:", updateError);
          // Check if is_paid column doesn't exist
          if (updateError.message?.includes("is_paid") || updateError.code === "PGRST204") {
            toast.warning("Comment added, but payment status could not be updated. Please run the migration: 20250120000004_add_payment_status_to_companies.sql", {
              duration: 8000
            });
          }
        } else {
          console.log("✅ Company marked as paid");
        }
      }

      if (isCategoryChanging) {
        toast.success(`Comment added successfully! Company moved from ${getCategoryDisplayName(lastComment.category)} to ${getCategoryDisplayName(category)} category.`);
      } else {
        toast.success(`Comment added successfully! Category: ${getCategoryDisplayName(category)}`);
      }

      setCommentText("");
      setCommentDate("");
      setOpen(false);
      // Refresh the data
      onUpdate();

      // Dispatch event to refresh all views (especially PaidClientPoolView when marked as paid)
      window.dispatchEvent(new CustomEvent('companyDataUpdated'));
    } catch (error: any) {
      console.error("Failed to add comment:", error);
      toast.error(error.message || "Failed to add comment");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // Check if company is already in inactive section (has deletion_state='inactive' or latest comment is 'block')
      const isInInactive = company.deletion_state === 'inactive' ||
        (lastComment && lastComment.category === 'block');

      // For employees deleting from inactive section → move to team lead recycle (never admin)
      if (userRole === "employee" && isInInactive) {
        // Always route to team_lead_recycle when employee deletes from inactive pool
        // This ensures data goes to team leader's recycle bin, not admin's
        let deletionState: 'team_lead_recycle' | 'admin_recycle' = 'team_lead_recycle';
        let successMessage = "Company moved to Team Lead's recycle bin";
        let teamLeadFound = false;

        // Try to get team lead ID for this employee (for logging purposes)
        // Step 1: Get team_id from team_members
        const { data: teamMemberData, error: teamMemberError } = await (supabase
          .from("team_members" as any)
          .select("team_id, employee_id")
          .eq("employee_id", userData.user.id)
          .maybeSingle() as any);

        console.log("🔍 CompanyCard - Team member lookup (inactive delete):", {
          teamMemberData,
          teamMemberError,
          employeeId: userData.user.id,
          hasTeamId: !!teamMemberData?.team_id
        });

        if (!teamMemberError && teamMemberData && teamMemberData.team_id) {
          // Step 2: Get team_lead_id from teams table
          // Try to read team data - employees might not have permission due to RLS
          const { data: teamData, error: teamError } = await (supabase
            .from("teams" as any)
            .select("team_lead_id, id, name")
            .eq("id", teamMemberData.team_id)
            .maybeSingle() as any);

          console.log("🔍 CompanyCard - Team lookup (inactive delete):", {
            teamData,
            teamError: teamError?.message,
            teamErrorCode: teamError?.code,
            teamId: teamMemberData.team_id,
            hasTeamLeadId: !!teamData?.team_lead_id,
            teamLeadId: teamData?.team_lead_id
          });

          if (teamError) {
            console.error("❌ CompanyCard - Error reading team (likely RLS issue):", teamError);
            // Data will still go to team_lead_recycle (not admin_recycle)
            console.warn("⚠️ CompanyCard - Cannot read team data. Data will still go to team_lead_recycle.");
          } else if (teamData) {
            if (teamData.team_lead_id) {
              // Employee has a team lead
              teamLeadFound = true;
              console.log("✅ CompanyCard - Found team lead (inactive delete):", teamData.team_lead_id);
            } else {
              console.warn("⚠️ CompanyCard - Team exists but has no team_lead_id set (data will still go to team_lead_recycle):", teamData.id);
            }
          } else {
            console.warn("⚠️ CompanyCard - Team not found or no access (data will still go to team_lead_recycle):", teamMemberData.team_id);
          }
        } else {
          console.warn("⚠️ CompanyCard - Employee not in any team (data will still go to team_lead_recycle, not admin_recycle)");
        }

        console.log("✅ CompanyCard - Employee deletion from inactive pool will go to team_lead_recycle (not admin_recycle)");

        // Ensure there's a "block" comment to preserve the category in recycle bin
        // Check if there's already a "block" comment
        const hasBlockComment = company.comments && company.comments.some((c: any) => c.category === 'block');

        console.log("🔍 CompanyCard - Checking for block comment:", {
          companyId: company.id,
          hasComments: !!company.comments,
          commentsCount: company.comments?.length || 0,
          hasBlockComment
        });

        if (!hasBlockComment) {
          // Add a "block" comment to preserve the inactive category
          console.log("📝 CompanyCard - Adding 'block' comment to preserve inactive category for company:", company.id);
          const { data: insertedComment, error: commentError } = await (supabase
            .from("comments")
            .insert({
              company_id: company.id,
              user_id: userData.user.id,
              comment_text: "Moved from Inactive Pool to Recycle Bin",
              category: "block"
            })
            .select() as any);

          if (commentError) {
            console.error("❌ CompanyCard - Failed to add block comment:", commentError);
            toast.error("Warning: Could not add category comment. Category may not display correctly in recycle bin.");
            // Continue with deletion even if comment addition fails
          } else {
            console.log("✅ CompanyCard - Successfully added 'block' comment:", insertedComment);
          }
        } else {
          console.log("✅ CompanyCard - Block comment already exists, skipping insertion");
        }

        // Update deletion_state to move to recycle bin
        const updateData = {
          deletion_state: deletionState as any,
          deleted_at: new Date().toISOString(),
          deleted_by_id: userData.user.id
        };

        console.log("💾 CompanyCard - Updating company (inactive delete):", { id: company.id, updateData, teamLeadFound });

        const { error, data: updatedData } = await (supabase
          .from("companies")
          .update(updateData as any)
          .eq("id", company.id)
          .select() as any);

        if (error) {
          console.error("Error moving to recycle bin:", error);

          // Check if deletion_state column doesn't exist (migration not run)
          if (error.message?.includes("deletion_state") ||
            error.message?.includes("deleted_at") ||
            error.message?.includes("deleted_by_id") ||
            error.code === "PGRST204") {
            toast.error(
              "Database migration not applied. Please run the migration: 20250120000002_add_deletion_state.sql in Supabase SQL Editor.",
              { duration: 10000 }
            );
            return;
          }

          throw error;
        }

        // Dispatch event to refresh all views
        window.dispatchEvent(new CustomEvent('companyDataUpdated'));

        toast.success(successMessage);
        onUpdate();
        return;
      }

      // For team leads deleting from recycle bin → move to admin recycle
      if (userRole === "team_lead" && company.deletion_state === 'team_lead_recycle') {
        const { error } = await (supabase
          .from("companies")
          .update({
            deletion_state: 'admin_recycle' as any,
            deleted_at: new Date().toISOString(),
            deleted_by_id: userData.user.id
          } as any)
          .eq("id", company.id) as any);

        if (error) {
          // Fallback if deletion_state column doesn't exist
          if (error.message?.includes("deletion_state")) {
            const { error: fallbackError } = await supabase
              .from("companies")
              .update({
                deleted_at: new Date().toISOString(),
                deleted_by_id: userData.user.id
              })
              .eq("id", company.id);

            if (fallbackError) throw fallbackError;
          } else {
            throw error;
          }
        }

        toast.success("Company moved to Admin's recycle bin");
        onUpdate();
        return;
      }

      // For team leads deleting from regular view → move to inactive section
      if (userRole === "team_lead" && !isInInactive) {
        const commentCategory = "block" as "block";

        const { error: commentError } = await supabase
          .from("comments")
          .insert([
            {
              company_id: company.id,
              user_id: userData.user.id,
              comment_text: "Moved to Inactive by team lead",
              category: commentCategory,
              comment_date: new Date().toISOString().slice(0, 10),
            },
          ]);

        if (commentError) throw commentError;

        const { error: stateError } = await (supabase
          .from("companies")
          .update({ deletion_state: 'inactive' as any } as any)
          .eq("id", company.id) as any);

        if (stateError && !stateError.message?.includes("deletion_state")) {
          console.warn("Could not set deletion_state:", stateError);
        }

        toast.success("Company moved to Inactive section");
        onUpdate();
        return;
      }

      // For team leads deleting from Inactive Pool → move to TL recycle bin
      if (userRole === "team_lead" && isInInactive) {
        const { error } = await (supabase
          .from("companies")
          .update({
            deletion_state: 'team_lead_recycle' as any,
            deleted_at: new Date().toISOString(),
            deleted_by_id: userData.user.id
          } as any)
          .eq("id", company.id) as any);

        if (error && !error.message?.includes("deletion_state")) {
          throw error;
        }

        toast.success("Company moved to your recycle bin");
        onUpdate();
        return;
      }

      // For employees deleting from regular view → move to inactive section
      if (userRole === "employee" && !isInInactive) {
        const commentCategory = "block" as "block";

        // First add block comment
        const { error: commentError } = await supabase
          .from("comments")
          .insert([
            {
              company_id: company.id,
              user_id: userData.user.id,
              comment_text: "Moved to Inactive by employee",
              category: commentCategory,
              comment_date: new Date().toISOString().slice(0, 10),
            },
          ]);

        if (commentError) {
          console.error("Error moving company to inactive via comment:", commentError);
          throw commentError;
        }

        // Set deletion_state to inactive
        const { error: stateError } = await (supabase
          .from("companies")
          .update({
            deletion_state: 'inactive' as any
          } as any)
          .eq("id", company.id) as any);

        // Ignore error if column doesn't exist (migration not run)
        if (stateError && !stateError.message?.includes("deletion_state")) {
          console.warn("Could not set deletion_state:", stateError);
        }

        toast.success("Company moved to Inactive section");
        onUpdate();
        return;
      }

      // For admins deleting from recycle bin → permanent delete
      if (userRole === "admin" && company.deletion_state === 'admin_recycle') {
        if (!confirm("Are you sure you want to permanently delete this company? This action cannot be undone.")) {
          return;
        }

        const { error } = await supabase
          .from("companies")
          .delete()
          .eq("id", company.id);

        if (error) throw error;

        toast.success("Company permanently deleted!");
        onUpdate();
        return;
      }

      // Default admin behavior: move to recycle bin
      if (userRole === "admin") {
        const { error } = await (supabase
          .from("companies")
          .update({
            deletion_state: 'admin_recycle' as any,
            deleted_at: new Date().toISOString(),
            deleted_by_id: userData.user.id
          } as any)
          .eq("id", company.id) as any);

        if (error) {
          // Fallback if columns don't exist
          if (error.message?.includes("deletion_state") || error.message?.includes("deleted_by_id")) {
            const { error: fallbackError } = await supabase
              .from("companies")
              .update({
                deleted_at: new Date().toISOString()
              })
              .eq("id", company.id);

            if (fallbackError) {
              // Last resort: hard delete
              const { error: deleteError } = await supabase
                .from("companies")
                .delete()
                .eq("id", company.id);

              if (deleteError) throw deleteError;
              toast.success("Company deleted successfully!");
            } else {
              toast.success("Company moved to recycle bin successfully!");
            }
          } else {
            throw error;
          }
        } else {
          toast.success("Company moved to recycle bin successfully!");
        }
        onUpdate();
        return;
      }

      toast.error("Unable to delete company. Invalid state.");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete company");
    }
  };

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:border-primary/20 border-2 flex flex-col h-full">
      <CardHeader className="pb-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold mb-2">
              <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="truncate">{company.company_name}</span>
            </CardTitle>
            {company.owner_name && (
              <p className="text-sm text-muted-foreground font-medium truncate">{company.owner_name}</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0 flex flex-col min-h-0">
        <div className="space-y-2.5 text-sm flex-1 min-h-0 overflow-hidden">
          <div className="flex items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors min-h-[20px]">
            <Phone className="h-4 w-4 flex-shrink-0 text-primary/70" />
            <a href={`tel:${company.phone}`} className="hover:underline truncate">{company.phone}</a>
          </div>
          {company.email && (
            <div className="flex items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors min-h-[20px]">
              <Mail className="h-4 w-4 flex-shrink-0 text-primary/70" />
              <a href={`mailto:${company.email}`} className="hover:underline truncate text-sm">{company.email}</a>
            </div>
          )}
          {company.address && (
            <div className="flex items-center gap-2.5 text-muted-foreground min-h-[20px]">
              <MapPin className="h-4 w-4 flex-shrink-0 text-primary/70" />
              <span className="text-sm truncate">{company.address}</span>
            </div>
          )}
          {company.products_services && (
            <div className="text-muted-foreground pt-1 border-t min-h-[20px] flex items-center gap-2">
              <span className="font-semibold text-foreground min-w-[140px] flex-shrink-0">Products & Services:</span>
              <span className="text-sm flex-1 truncate min-w-0">{company.products_services}</span>
            </div>
          )}
          {showAssignedTo && (
            <div className="flex items-center gap-2 text-muted-foreground pt-1 border-t min-h-[20px]">
              <span className="font-semibold text-foreground min-w-[90px] flex-shrink-0">Assigned to:</span>
              {company.assigned_to ? (
                <span className="text-sm truncate flex-1 min-w-0 text-emerald-600 font-bold">{company.assigned_to.display_name}</span>
              ) : (
                <span className="text-sm text-orange-600 font-medium">Unassigned</span>
              )}
            </div>
          )}
          {userRole !== "admin" && company.assigned_at && (
            <div className="flex items-center gap-2.5 text-muted-foreground pt-1 border-t min-h-[20px]">
              <Clock className="h-4 w-4 flex-shrink-0 text-primary/70" />
              <span className="text-sm text-foreground">
                <span className="font-semibold">Assigned:</span>{" "}
                {new Date(company.assigned_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          )}
          {!hideCategory && !lastComment && userRole !== "admin" && (
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground pt-1 border-t">
              <div>
                <span className="font-semibold text-foreground">Current Category:</span>{" "}
                <span className="text-blue-600 font-medium">🆕 Fresh data - Add first comment</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary/70" />
                <span>
                  <span className="font-semibold text-foreground">Assigned:</span>{" "}
                  {company.assigned_at ? new Date(company.assigned_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'Recently'}
                </span>
              </div>
            </div>
          )}
          {!hideCategory && lastComment && userRole !== "admin" && (() => {
            // Check if comment was made AFTER the current assignment
            const assignedAt = company.assigned_at ? new Date(company.assigned_at).getTime() : 0;
            const commentAt = new Date(lastComment.created_at).getTime();
            const isCommentAfterAssignment = assignedAt === 0 || commentAt >= assignedAt;

            // If comment is older than assignment, show as "Needs categorization"
            if (!isCommentAfterAssignment) {
              return (
                <div className="flex flex-col gap-0.5 text-xs text-muted-foreground pt-1 border-t">
                  <div>
                    <span className="font-semibold text-foreground">Current Category:</span>{" "}
                    <span className="text-yellow-600 font-medium">⏳ Needs re-categorization</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-primary/70" />
                    <span>
                      <span className="font-semibold text-foreground">Assigned:</span>{" "}
                      {new Date(company.assigned_at).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              );
            }

            // Comment is after assignment - show normal category info
            return (
              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground pt-1 border-t">
                <div>
                  <span className="font-semibold text-foreground">Current Category:</span>{" "}
                  <span>
                    {getCategoryIcon(lastComment.category)} {getCategoryDisplayName(lastComment.category)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-primary/70" />
                  <span>
                    <span className="font-semibold text-foreground">Category Updated:</span>{" "}
                    {new Date(lastComment.created_at).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {lastComment && userRole === "admin" && (
          <div className="border-t pt-4 bg-muted/30 rounded-lg p-3 -mx-1 mt-auto">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Last Comment</p>
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                {getCategoryIcon(lastComment.category)} {getCategoryDisplayName(lastComment.category)}
              </Badge>
            </div>
            <p className="text-sm text-foreground leading-relaxed mb-2">{lastComment.comment_text}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastComment.comment_date
                ? new Date(lastComment.comment_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })
                : new Date(lastComment.created_at).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2 mt-auto items-center flex-nowrap">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-primary text-white hover:bg-primary hover:text-primary-foreground transition-colors h-9 min-w-0"
              >
                <MessageSquare className="mr-2 h-4 w-4 text-white flex-shrink-0" />
                <span className="text-white truncate">Add Comment</span>
              </Button>
            </DialogTrigger>
            {customFooter && (
              <div className="flex-1 w-full">
                {customFooter}
              </div>
            )}
            <DialogContent className="sm:max-w-[650px]">
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2 text-white">
                  <Building2 className="h-5 w-5 text-primary" />
                  Add Comment - {company.company_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {/* Company Details Section */}
                <div className="p-3 bg-muted/30 rounded-lg border border-border">
                  <h3 className="text-sm font-semibold text-white mb-2">Company Details</h3>
                  <div className="space-y-2 text-sm">
                    {company.company_name && (
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-white/80 min-w-[120px] flex-shrink-0">Company:</span>
                        <span className="text-white flex-1">{company.company_name}</span>
                      </div>
                    )}
                    {company.phone && (
                      <div className="flex items-start gap-2">
                        <Phone className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="font-semibold text-white/80 min-w-[120px] flex-shrink-0">Phone:</span>
                        <span className="text-white flex-1">{company.phone}</span>
                      </div>
                    )}
                    {company.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="font-semibold text-white/80 min-w-[120px] flex-shrink-0">Address:</span>
                        <span className="text-white flex-1">{company.address}</span>
                      </div>
                    )}
                    {company.products_services && (
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-white/80 min-w-[120px] flex-shrink-0">Products & Services:</span>
                        <span className="text-white flex-1">{company.products_services}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">Comment</label>
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Enter your comment..."
                    rows={4}
                    className="resize-none text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-white">
                      Date {userRole !== "admin" && <span className="text-destructive">*</span>}
                    </label>
                    <Input
                      type="date"
                      value={commentDate}
                      onChange={(e) => setCommentDate(e.target.value)}
                      className="w-full text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-white">Category</label>
                      {lastComment && (
                        <span className="text-xs text-white/70">
                          Current: {getCategoryIcon(lastComment.category)} {getCategoryDisplayName(lastComment.category)}
                        </span>
                      )}
                    </div>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="w-full text-white">
                        <SelectValue>
                          <span className="flex items-center gap-2 text-white">
                            {getCategoryIcon(category)} {getCategoryDisplayName(category)}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">
                          <span className="flex items-center gap-2">
                            {getCategoryIcon('active')} Active Pool
                          </span>
                        </SelectItem>
                        <SelectItem value="prime">
                          <span className="flex items-center gap-2">
                            {getCategoryIcon('prime')} Prime Pool
                          </span>
                        </SelectItem>
                        <SelectItem value="inactive">
                          <span className="flex items-center gap-2">
                            {getCategoryIcon('inactive')} Inactive Pool
                          </span>
                        </SelectItem>
                        <SelectItem value="general">
                          <span className="flex items-center gap-2">
                            {getCategoryIcon('general')} General Data
                          </span>
                        </SelectItem>
                        <SelectItem value="paid">
                          <span className="flex items-center gap-2">
                            {getCategoryIcon('paid')} Paid
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={handleAddComment}
                  disabled={loading || !commentText.trim()}
                  className="w-full font-semibold bg-primary text-white hover:bg-primary hover:text-primary-foreground"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="mr-2 h-4 w-4 text-white" />
                      <span className="text-white">Add Comment</span>
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {company.comments && company.comments.length > 0 && (
            <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-primary text-white hover:bg-primary hover:text-primary-foreground transition-colors h-9 flex-shrink-0"
                >
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5 text-white flex-shrink-0" />
                  <span className="font-semibold text-white">{company.comments.length}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh]">
                <DialogHeader>
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Comments for {company.company_name}
                    <Badge variant="secondary" className="ml-2">{company.comments.length} total</Badge>
                  </DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[65vh] pr-4">
                  <div className="space-y-4">
                    {company.comments
                      .slice()
                      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((comment: any) => (
                        <Card key={comment.id} className="p-4 hover:shadow-md transition-shadow border-l-4 border-l-primary/50">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center border-2 border-primary/20">
                                <span className="text-sm font-bold text-primary">
                                  {comment.user?.display_name?.charAt(0) || 'U'}
                                </span>
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-foreground">
                                  {comment.user?.display_name || 'Unknown User'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {comment.user?.email}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge className={`text-xs font-semibold ${getCategoryColor(mapDbCategoryToDisplay(comment.category))}`}>
                                {getCategoryIcon(comment.category)} {getCategoryDisplayName(comment.category)}
                              </Badge>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {new Date(comment.created_at).toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed pl-1">
                            {comment.comment_text}
                          </p>
                        </Card>
                      ))}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          )}

          {canDelete && (
            <Button
              variant="destructive"
              className="hover:scale-105 transition-transform h-9 gap-2 flex-shrink-0"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CompanyCard;
