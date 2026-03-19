import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { User, Mail, Calendar, MessageSquare, Clock, Loader2, Edit, Pencil, Trash2, Phone, Share2, CheckCircle2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface FacebookDataCardProps {
  data: {
    id: number;
    name: string | null;
    email: string | null;
    phone?: string | null;
    company_name?: string | null;
    owner_name?: string | null;
    products?: string | null;
    services?: string | null;
    created_at: string;
    shared_at?: string | null;
    comments?: any[];
  };
  onUpdate: () => void;
  userRole?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onRequestEdit?: () => void;
  canEdit?: boolean;
  onRestore?: () => void;
  isDeleted?: boolean;
  approvedForEdit?: boolean;
  customFooter?: React.ReactNode;
  showAssignedTo?: boolean;
}

// Map database category names to display names
const mapDbCategoryToDisplay = (dbCategory: string): string => {
  const mapping: Record<string, string> = {
    "hot": "prime",
    "follow_up": "active",
    "block": "inactive",
    "general": "general",
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
    "general": "general"
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
    default: return '📄';
  }
};

const getCategoryColor = (category: string) => {
  const displayCategory = mapDbCategoryToDisplay(category);
  switch (displayCategory) {
    case 'prime': return 'bg-red-100 text-red-800 border-red-200';
    case 'active': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'general': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-blue-100 text-blue-800 border-blue-200';
  }
};

const getCategoryDisplayName = (category: string): string => {
  const displayCategory = mapDbCategoryToDisplay(category);
  switch (displayCategory) {
    case 'prime': return 'Prime Pool';
    case 'active': return 'Active Pool';
    case 'inactive': return 'Inactive Pool';
    case 'general': return 'General Data';
    default: return displayCategory.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
};

const FacebookDataCard = ({
  data,
  onUpdate,
  userRole,
  onEdit,
  onDelete,
  onRestore,
  isDeleted = false,
  onRequestEdit,
  canEdit = true,
  approvedForEdit = false,
  customFooter,
  showAssignedTo,
}: FacebookDataCardProps) => {
  const [commentText, setCommentText] = useState("");
  const [category, setCategory] = useState("general");
  const [commentDate, setCommentDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false); // New state for comment dialog
  const [isSubmitting, setIsSubmitting] = useState(false); // New state for comment submission

  const sortedComments = (data.comments || []).slice().sort(
    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const lastComment = sortedComments.length > 0 ? sortedComments[sortedComments.length - 1] : undefined;
  const comments = sortedComments;

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (open || isCommentDialogOpen) { // Check both dialog states
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
  }, [open, isCommentDialogOpen, lastComment?.category]);

  const handleAddComment = async () => {
    if (!commentText.trim()) {
      toast.error("Please enter a comment");
      return;
    }

    // For employees, date is mandatory
    if (userRole !== "admin" && !commentDate && !isCommentDialogOpen) { // Only mandatory if not the new dialog
      toast.error("Please select a date for your comment");
      return;
    }

    // Validate category (using display names)
    const validCategories = ["active", "prime", "inactive", "general"];
    if (!validCategories.includes(category)) {
      toast.error("Please select a valid category");
      return;
    }

    setLoading(true);
    setIsSubmitting(true); // Use new state for submission
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error("Not authenticated");
      }

      // Check if category is changing (compare display names)
      const lastCommentDisplayCategory = lastComment?.category ? mapDbCategoryToDisplay(lastComment.category) : null;
      const isCategoryChanging = lastCommentDisplayCategory && lastCommentDisplayCategory !== category;

      // Map display category name to database category name
      const commentCategory = mapDisplayCategoryToDb(category) as "follow_up" | "hot" | "block" | "general";

      const { error } = await (supabase
        .from("facebook_data_comments" as any)
        .insert([
          {
            facebook_data_id: data.id,
            user_id: userData.user.id,
            comment_text: commentText.trim(),
            category: commentCategory,
            comment_date: commentDate || null,
          },
        ]) as any);

      if (error) {
        console.error("Error adding comment:", error);

        // Check if table doesn't exist (404 error)
        const errorMessage = error.message || "";
        const errorCode = error.code || "";
        const errorStatus = (error as any).status || (error as any).statusCode;

        if (
          errorCode === "PGRST205" ||
          errorCode === "42P01" ||
          errorStatus === 404 ||
          errorMessage.toLowerCase().includes("could not find") ||
          errorMessage.toLowerCase().includes("does not exist") ||
          errorMessage.toLowerCase().includes("relation") && errorMessage.toLowerCase().includes("does not exist") ||
          errorMessage.includes("404")
        ) {
          toast.error(
            "The comments table is not found. Please run the SQL script: create_facebook_data_comments_table.sql in Supabase SQL Editor.",
            { duration: 12000 }
          );
          console.error("Table missing. Run the migration: 20250117000004_create_facebook_data_comments.sql");
          return;
        }

        throw error;
      }

      if (isCategoryChanging) {
        toast.success(`Comment added successfully! Category changed from ${getCategoryDisplayName(lastComment.category)} to ${getCategoryDisplayName(category)}.`);
      } else {
        toast.success(`Comment added successfully! Category: ${getCategoryDisplayName(category)}`);
      }

      setCommentText("");
      setCommentDate("");
      setOpen(false);
      setIsCommentDialogOpen(false); // Close new dialog
      // Refresh the data
      onUpdate();
    } catch (error: any) {
      console.error("Failed to add comment:", error);
      toast.error(error.message || "Failed to add comment");
    } finally {
      setLoading(false);
      setIsSubmitting(false); // Reset submission state
    }
  };

  return (
    <Card className={`group hover:shadow-lg transition-all duration-300 hover:border-primary/20 border-2 overflow-hidden flex flex-col h-full ${isDeleted ? 'opacity-60 grayscale' : ''}`}>
      <CardHeader className="pb-4 flex-shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700 flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold">
              <Share2 className="h-3 w-3" />
              Facebook
            </Badge>
            <div className="flex items-center gap-2">
              {userRole === "admin" && onEdit && !isDeleted && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onEdit}
                  className="h-8 w-8 bg-primary text-white hover:bg-primary hover:text-white transition-colors flex-shrink-0"
                >
                  <Edit className="h-4 w-4 text-white" />
                </Button>
              )}
              {!isDeleted && (
                approvedForEdit ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-green-600 text-white hover:bg-green-600 hover:text-white transition-colors flex-shrink-0 cursor-default"
                    disabled
                  >
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  </Button>
                ) : onRequestEdit ? (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onRequestEdit}
                    className="h-8 w-8 bg-primary text-white hover:bg-primary hover:text-white transition-colors flex-shrink-0"
                  >
                    <Pencil className="h-4 w-4 text-white" />
                  </Button>
                ) : null
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <User className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="truncate">{data.name || data.company_name || "Unknown"}</span>
            </CardTitle>
            {userRole !== "admin" && data.owner_name && (
              <p className="text-sm text-muted-foreground truncate mt-1">{data.owner_name}</p>
            )}
            {userRole === "admin" && (
              <Badge variant="outline" className="text-xs mt-1">
                ID: {data.id}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0 overflow-hidden flex flex-col min-h-0">
        <div className="space-y-2.5 text-sm flex-1 min-h-0 overflow-hidden">
          {data.phone && (
            <div className="flex items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors min-h-[20px]">
              <Phone className="h-4 w-4 flex-shrink-0 text-primary" />
              <a href={`tel:${data.phone}`} className="hover:underline truncate text-sm text-foreground">{data.phone}</a>
            </div>
          )}
          {data.email && (
            <div className="flex items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors min-h-[20px]">
              <Mail className="h-4 w-4 flex-shrink-0 text-primary" />
              <a href={`mailto:${data.email}`} className="hover:underline truncate text-sm text-foreground">{data.email}</a>
            </div>
          )}
          {userRole === "admin" && data.company_name && (
            <div className="text-sm text-foreground min-h-[20px] flex items-center gap-2">
              <span className="font-semibold min-w-[70px] flex-shrink-0">Company:</span>
              <span className="flex-1 truncate min-w-0">{data.company_name}</span>
            </div>
          )}
          {userRole === "admin" && data.owner_name && (
            <div className="text-sm text-foreground min-h-[20px] flex items-center gap-2">
              <span className="font-semibold min-w-[70px] flex-shrink-0">Owner:</span>
              <span className="flex-1 truncate min-w-0">{data.owner_name}</span>
            </div>
          )}
          {userRole === "admin" && data.products && (
            <div className="text-sm text-foreground min-h-[20px] flex items-center gap-2">
              <span className="font-semibold min-w-[70px] flex-shrink-0">Products:</span>
              <span className="flex-1 truncate min-w-0">{data.products}</span>
            </div>
          )}
          {userRole === "admin" && data.services && (
            <div className="text-sm text-foreground min-h-[20px] flex items-center gap-2">
              <span className="font-semibold min-w-[70px] flex-shrink-0">Services:</span>
              <span className="flex-1 truncate min-w-0">{data.services}</span>
            </div>
          )}
          {userRole !== "admin" && (data.products || data.services) && (
            <div className="text-sm text-foreground min-h-[20px] flex items-center gap-2 pt-1 border-t">
              <span className="font-semibold min-w-[140px] flex-shrink-0">Products & Services:</span>
              <span className="flex-1 truncate min-w-0">
                {[data.products, data.services].filter(Boolean).join(", ")}
              </span>
            </div>
          )}
          {lastComment && userRole !== "admin" && (
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground pt-1 border-t">
              <div>
                <span className="font-semibold text-foreground">Current Category:</span>{" "}
                <span>
                  {getCategoryIcon(lastComment.category)} {getCategoryDisplayName(lastComment.category)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary" />
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
          )}
          <div className="space-y-1.5">
            {data.created_at && (
              <div className="flex items-center gap-2.5 text-muted-foreground min-h-[20px]">
                <Calendar className="h-4 w-4 flex-shrink-0 text-primary" />
                <span className="text-sm text-foreground">
                  <span className="font-semibold">Uploaded:</span>{" "}
                  {new Date(data.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            )}
            {data.shared_at && (
              <div className="flex items-center gap-2.5 text-primary min-h-[20px]">
                <Share2 className="h-4 w-4 flex-shrink-0 text-primary" />
                <span className="text-sm text-foreground">
                  <span className="font-semibold">Shared:</span>{" "}
                  {new Date(data.shared_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            )}
            {showAssignedTo && (
              <div className="flex items-center gap-2 text-muted-foreground pt-1 border-t min-h-[20px]">
                <span className="font-semibold text-foreground min-w-[90px] flex-shrink-0">Assigned to:</span>
                {(data as any).facebook_data_shares && (data as any).facebook_data_shares.length > 0 ? (
                  <span className="text-sm truncate flex-1 min-w-0 text-emerald-600 font-bold">
                    {(data as any).facebook_data_shares.map((s: any) => s.profiles?.display_name).filter(Boolean).join(", ")}
                  </span>
                ) : (
                  <span className="text-sm text-orange-600 font-medium">Unassigned</span>
                )}
              </div>
            )}
          </div>
        </div>

        {lastComment && userRole === "admin" && (
          <div className="border-t pt-4 bg-muted/30 rounded-lg p-3 -mx-1 text-white mt-auto">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Last Comment</p>
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                {getCategoryIcon(lastComment.category)} {getCategoryDisplayName(lastComment.category)}
              </Badge>
            </div>
            <p className="text-sm text-foreground leading-relaxed mb-2">{lastComment.comment_text}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(lastComment.created_at).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        )}

        <div className={`flex gap-2 pt-3 border-t flex-nowrap w-full mt-auto items-center ${userRole !== "admin" ? "gap-1.5" : "gap-2"}`}>
          {onRestore && isDeleted ? (
            <>
              <Button
                onClick={onRestore}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                <Clock className="h-4 w-4" />
                Restore Data
              </Button>
              {onDelete && (
                <Button
                  onClick={onDelete}
                  variant="destructive"
                  size="icon"
                  className="shrink-0"
                  title="Permanently Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          ) : (
            <>
              {userRole === "admin" ? (
                <>
                  <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`${userRole !== "admin" ? "flex-1 h-9 text-xs px-2 min-w-0" : "flex-1 min-w-[100px] max-w-full h-9"} bg-primary text-white hover:bg-primary hover:text-white transition-colors font-medium`}
                      >
                        <MessageSquare className={`${userRole !== "admin" ? "mr-1.5 h-3.5 w-3.5 flex-shrink-0" : "mr-2 h-4 w-4 flex-shrink-0"} text-white`} />
                        <span className={`${userRole !== "admin" ? "text-xs " : ""} truncate text-white`}>Add Comment</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[650px]">
                      <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2 text-white">
                          <User className="h-5 w-5 text-primary" />
                          Add Comment - {data.name || data.company_name || "Unknown"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        {/* Company Details Section */}
                        <div className="p-3 bg-muted/30 rounded-lg border border-border">
                          <h3 className="text-sm font-semibold text-white mb-2">Company Details</h3>
                          <div className="space-y-2 text-sm">
                            {data.company_name && (
                              <div className="flex items-start gap-2">
                                <span className="font-semibold text-white/80 min-w-[120px] flex-shrink-0">Company:</span>
                                <span className="text-white flex-1">{data.company_name}</span>
                              </div>
                            )}
                            {data.phone && (
                              <div className="flex items-start gap-2">
                                <Phone className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                                <span className="font-semibold text-white/80 min-w-[120px] flex-shrink-0">Phone:</span>
                                <span className="text-white flex-1">{data.phone}</span>
                              </div>
                            )}
                            {data.address && (
                              <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                                <span className="font-semibold text-white/80 min-w-[120px] flex-shrink-0">Address:</span>
                                <span className="text-white flex-1">{data.address}</span>
                              </div>
                            )}
                            {(data.products || data.services) && (
                              <div className="flex items-start gap-2">
                                <span className="font-semibold text-white/80 min-w-[120px] flex-shrink-0">Products & Services:</span>
                                <span className="text-white flex-1">
                                  {[data.products, data.services].filter(Boolean).join(", ")}
                                </span>
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
                            className="resize-none text-white placeholder:text-white/50"
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
                              className="w-full text-white [color-scheme:dark]"
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
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button
                          onClick={handleAddComment}
                          disabled={loading || !commentText.trim()}
                          className="w-full font-semibold"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <MessageSquare className="mr-2 h-4 w-4" />
                              Add Comment
                            </>
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              ) : (
                <>
                  <Dialog open={isCommentDialogOpen} onOpenChange={setIsCommentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="flex-1 bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/25 border-none">
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Add Comment
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px] bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                          Submit Follow-up
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-6 pt-4">
                        <div className="space-y-4">
                          <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-primary" />
                            Select Disposition
                          </label>
                          <Select value={category} onValueChange={(val: any) => setCategory(val)}>
                            <SelectTrigger className="h-12 bg-white/5 border-white/10 focus:ring-primary/50 transition-all duration-300">
                              <SelectValue placeholder="Select Category" />
                            </SelectTrigger>
                            <SelectContent className="bg-background/95 backdrop-blur-xl border-white/10">
                              <SelectItem value="prime" className="focus:bg-red-500/10 focus:text-red-500">🔥 Prime Pool</SelectItem>
                              <SelectItem value="active" className="focus:bg-orange-500/10 focus:text-orange-500">📅 Active Pool</SelectItem>
                              <SelectItem value="general" className="focus:bg-green-500/10 focus:text-green-500">📋 General Data</SelectItem>
                              <SelectItem value="inactive" className="focus:bg-gray-500/10 focus:text-gray-500 font-bold text-red-500">🚫 Inactive Pool (Soft Delete)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-foreground/80">Message</label>
                          <Textarea
                            placeholder="Write your detailed update here..."
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            className="min-h-[120px] bg-white/5 border-white/10 focus:ring-primary/50 resize-none transition-all duration-300"
                          />
                        </div>

                        <Button
                          onClick={handleAddComment}
                          disabled={isSubmitting || !commentText.trim()}
                          className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold shadow-xl shadow-primary/20 transition-all duration-300 transform hover:-translate-y-0.5"
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            "Post Follow-up"
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {approvedForEdit ? (
                    <Button
                      onClick={onEdit}
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 border-green-200 bg-green-50 hover:bg-green-100 text-green-600 shadow-sm"
                      title="Edit Approved"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={onRequestEdit}
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 border-primary/20 hover:bg-primary/5 text-primary shadow-sm"
                      title="Request Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </>
          )}

          {comments.length > 0 && (
            <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`${userRole !== "admin" ? "h-9 w-9 p-0 relative flex-shrink-0" : "flex-shrink-0 h-9"} bg-primary text-white hover:bg-primary hover:text-white transition-colors`}
                >
                  <MessageSquare className={`${userRole !== "admin" ? "h-3.5 w-3.5" : "mr-1.5 h-3.5 w-3.5"} text-white flex-shrink-0`} />
                  {userRole === "admin" && <span className="font-semibold">{comments.length}</span>}
                  {userRole !== "admin" && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-4 w-4 flex items-center justify-center text-[10px] font-semibold ">
                      {comments.length}
                    </span>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh]">
                <DialogHeader>
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Comments for {data.name || "Unknown"}
                    <Badge variant="secondary" className="ml-2">{comments.length} total</Badge>
                  </DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[65vh] pr-4">
                  <div className="space-y-4">
                    {comments
                      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
                              {userRole === "admin" && (
                                <Badge className={`text-xs font-semibold ${getCategoryColor(mapDbCategoryToDisplay(comment.category))}`}>
                                  {getCategoryIcon(comment.category)} {getCategoryDisplayName(comment.category)}
                                </Badge>
                              )}
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

          {onDelete && (
            <Button
              variant="destructive"
              className="hover:scale-105 transition-transform h-9 gap-2 flex-shrink-0"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card >
  );
};

export default FacebookDataCard;

