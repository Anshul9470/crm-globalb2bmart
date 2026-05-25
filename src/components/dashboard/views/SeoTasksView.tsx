import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Building2, Calendar, DollarSign, MapPin, Phone, Mail, MessageSquare, Download, ExternalLink, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

interface SeoTasksViewProps {
  userId: string;
}

const SeoTasksView = ({ userId }: SeoTasksViewProps) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [completionComments, setCompletionComments] = useState<Record<string, string>>({});
  const [completingTasks, setCompletingTasks] = useState<Record<string, boolean>>({});
  const [companyComments, setCompanyComments] = useState<Record<string, any[]>>({});
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [savingComments, setSavingComments] = useState<Record<string, boolean>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      try {
        // Get current user to check their email for task assignment
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          throw new Error("Not authenticated");
        }

        // Fetch SEO comments with related company and author information
        // Note: We fetch all SEO comments and filter by assignment in the application layer
        // because RLS policies allow employees to view SEO category comments
        const { data: seoComments, error } = await supabase
          .from("comments" as any)
          .select(`
            id,
            comment_text,
            comment_date,
            created_at,
            company_id,
            company:companies!company_id (
              id,
              company_name,
              owner_name,
              phone,
              email,
              address,
              payment_date,
              payment_amount,
              assigned_to:profiles!assigned_to_id(
                display_name,
                email
              )
            ),
            user:profiles!user_id(
              display_name,
              email
            )
          ` as any)
          .eq("category", "seo" as any)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("❌ Error fetching SEO comments:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));
          // Don't throw - show empty state instead
          setTasks([]);
          setLoading(false);
          toast.error(`Failed to fetch tasks: ${error.message || "Unknown error"}`);
          return;
        }

        console.log(`🔍 SeoTasksView: Fetched ${seoComments?.length || 0} SEO comments`);
        
        if (!seoComments || seoComments.length === 0) {
          console.log("ℹ️ No SEO comments found. This could be due to:");
          console.log("  1. No tasks have been sent from Paid Client Pool");
          console.log("  2. RLS policies preventing access to comments");
          console.log("  3. User role is not 'employee' or 'seo_website'");
          setTasks([]);
          setLoading(false);
          return;
        }

        // Filter tasks assigned to this employee OR tasks without specific assignment
        // Tasks are assigned via "SEO/Website Employee: [name] ([email])" in comment_text
        const userEmail = authUser.email?.toLowerCase();
        
        // First, get all company IDs from SEO comments to check for completion
        const allCompanyIds = [...new Set((seoComments || []).map((c: any) => c.company_id))];
        
        // Fetch all SEO comments for these companies to check completion status
        let completedCompanyIds = new Set<string>();
        if (allCompanyIds.length > 0) {
          const { data: allComments } = await supabase
            .from("comments" as any)
            .select("id, company_id, comment_text, category, created_at")
            .in("company_id", allCompanyIds)
            .eq("category", "seo" as any);
          
          // Find companies that have completion comments
          completedCompanyIds = new Set(
            (allComments || [])
              .filter((c: any) => c.comment_text?.includes("TASK_COMPLETED:"))
              .map((c: any) => c.company_id)
          );
          
          console.log(`✅ SeoTasksView: Found ${completedCompanyIds.size} companies with completion comments`);
        }
        
        const assignedTasks = (seoComments || []).filter((comment: any) => {
          // Exclude completion comments themselves
          const commentText = comment.comment_text || "";
          if (commentText.includes("TASK_COMPLETED:")) {
            return false;
          }
          
          // Exclude tasks for companies that have been completed
          // A company is considered completed if it has ANY completion comment
          if (completedCompanyIds.has(comment.company_id)) {
            console.log(`🚫 Task ${comment.id} filtered out - company ${comment.company_id} has completion comment`);
            return false;
          }

          // Check if this task is assigned to the current user
          const lines = commentText.split("\n");
          const employeeLine = lines.find((line: string) => 
            line.trim().startsWith("SEO/Website Employee:")
          );
          
          if (employeeLine) {
            // Extract email from the employee line
            // Format: "SEO/Website Employee: Name (email@example.com)"
            const emailMatch = employeeLine.match(/\(([^)]+)\)/);
            if (emailMatch && emailMatch[1]) {
              const assignedEmail = emailMatch[1].toLowerCase().trim();
              const isAssigned = assignedEmail === userEmail;
              console.log(`📋 Task ${comment.id}: assigned to ${assignedEmail}, current user: ${userEmail}, match: ${isAssigned}`);
              return isAssigned;
            }
          }
          
          // If no assignment line found, show to all SEO employees (backward compatibility)
          console.log(`📋 Task ${comment.id}: No assignment line, showing to all SEO employees`);
          return true;
        });

        console.log(`👤 SeoTasksView: Filtered to ${assignedTasks.length} active tasks (assigned to ${userEmail} or unassigned)`);
        
        // Log tasks with company data issues
        assignedTasks.forEach((task: any) => {
          if (!task.company) {
            console.warn(`⚠️ Task ${task.id} has no company data (RLS issue?)`);
          }
        });

        setTasks(assignedTasks);

        // Fetch all comments for companies in assigned tasks
        const companyIds = [...new Set(assignedTasks.map((t: any) => t.company_id))];
        if (companyIds.length > 0) {
          const { data: allComments } = await supabase
            .from("comments" as any)
            .select(`
              id,
              comment_text,
              comment_date,
              created_at,
              company_id,
              category,
              user_id,
              user:profiles!user_id(
                display_name,
                email
              )
            ` as any)
            .in("company_id", companyIds)
            .order("created_at", { ascending: false });

          if (allComments) {
            // Group comments by company_id
            const commentsByCompany: Record<string, any[]> = {};
            allComments.forEach((comment: any) => {
              if (!commentsByCompany[comment.company_id]) {
                commentsByCompany[comment.company_id] = [];
              }
              commentsByCompany[comment.company_id].push(comment);
            });
            setCompanyComments(commentsByCompany);
          }
        }
      } catch (err) {
        console.error("Error fetching SEO / website tasks:", err);
        toast.error("Failed to fetch tasks");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('seo_tasks_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        console.log('📢 SeoTasksView: Comment change detected', payload);
        fetchTasks(); // This will refresh both tasks and comments
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">SEO / Website Tasks</h2>
          <p className="text-muted-foreground mt-1 text-white">
            Paid client leads sent from the Paid Client Pool.
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {tasks.length} {tasks.length === 1 ? "Task" : "Tasks"}
        </Badge>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium text-white mb-2">No SEO / Website tasks yet</p>
            <p className="text-sm text-muted-foreground">
              When a Paid Team Lead sends a paid client to SEO / website, it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {tasks.map((task) => (
            <Card key={task.id} className="flex flex-col hover:shadow-xl transition-all duration-300 hover:scale-[1.02] border-2 hover:border-primary/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-white text-base font-bold">
                  <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="truncate text-xs text-muted-foreground">
                    {task.company?.company_name || "Unknown Company"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm flex flex-col pb-4">
                <div className="space-y-2">
                  {task.company?.owner_name && (
                    <p className="text-muted-foreground text-xs font-medium">Owner: {task.company.owner_name}</p>
                  )}
                  {task.company?.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate text-xs">{task.company.phone}</span>
                    </div>
                  )}
                  {task.company?.email && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate text-xs">{task.company.email}</span>
                    </div>
                  )}
                  {task.company?.address && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-1 text-xs">{task.company.address}</span>
                    </div>
                  )}
                  {task.company?.payment_date && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-xs">
                        Paid on: {new Date(task.company.payment_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {task.company?.payment_amount && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-xs">
                        Amount: $
                        {Number(task.company.payment_amount).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}
                </div>
                <div className="border-t pt-3 mt-2 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold ">
                    <MessageSquare className="h-3 w-3 text-primary" />
                    <span>Brief from Paid Lead</span>
                  </div>
                  {(() => {
                    // Parse comment text to extract attachment URL and employee info
                    const lines = (task.comment_text || "").split("\n");
                    const attachmentLine = lines.find((line: string) => line.trim().startsWith("Attachment:"));
                    const employeeLine = lines.find((line: string) => line.trim().startsWith("SEO/Website Employee:"));
                    const attachmentUrl = attachmentLine?.replace("Attachment:", "").trim();
                    const employeeInfo = employeeLine?.replace("SEO/Website Employee:", "").trim();
                    const briefText = lines
                      .filter((line: string) => 
                        !line.trim().startsWith("Attachment:") && 
                        !line.trim().startsWith("SEO/Website Employee:")
                      )
                      .join("\n")
                      .trim();

                    return (
                      <>
                        {briefText && (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3 max-h-[60px] overflow-hidden">
                            {briefText}
                          </p>
                        )}
                        {employeeInfo && (
                          <div className="mt-1.5 p-2 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800 text-xs">
                            <p className="text-blue-700 dark:text-blue-300 font-semibold text-xs">
                              Assigned Employee: {employeeInfo}
                            </p>
                            {task.company?.assigned_to?.email && (
                              <p className="text-blue-600 dark:text-blue-400 text-[10px] mt-0.5 truncate">
                                ({task.company.assigned_to.email})
                              </p>
                            )}
                          </div>
                        )}
                        {attachmentUrl && (() => {
                          // Extract bucket name and file path from URL
                          // URL format: https://project.supabase.co/storage/v1/object/public/bucket-name/path/to/file
                          const urlMatch = attachmentUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
                          let bucketName = "web_seo_uploads";
                          let filePath = "";
                          
                          if (urlMatch) {
                            bucketName = urlMatch[1];
                            filePath = urlMatch[2];
                          } else {
                            // Try to extract from old format or direct path
                            const pathMatch = attachmentUrl.match(/([^\/]+)\/(.+)$/);
                            if (pathMatch && pathMatch[1] !== "storage" && pathMatch[1] !== "v1") {
                              // Assume it's a direct path: companyId/filename
                              filePath = attachmentUrl.split("/").slice(-2).join("/");
                            }
                          }

                          // If bucket name is wrong, try to fix it
                          if (bucketName !== "web_seo_uploads" && bucketName !== "seo_uploads") {
                            // Try to extract path from URL and reconstruct with correct bucket
                            const pathParts = attachmentUrl.split("/");
                            const pathIndex = pathParts.findIndex(p => p === "public");
                            if (pathIndex !== -1 && pathParts[pathIndex + 2]) {
                              filePath = pathParts.slice(pathIndex + 2).join("/");
                            }
                            bucketName = "web_seo_uploads";
                          }

                          const handleDownload = async () => {
                            try {
                              // Use Supabase storage API to download the file
                              let downloadResult = await supabase.storage
                                .from(bucketName)
                                .download(filePath);

                              // If bucket name was wrong, try the other one
                              if (downloadResult.error && bucketName === "web_seo_uploads") {
                                downloadResult = await supabase.storage
                                  .from("seo_uploads")
                                  .download(filePath);
                              }

                              if (downloadResult.error) {
                                throw downloadResult.error;
                              }

                              if (downloadResult.data) {
                                const url = window.URL.createObjectURL(downloadResult.data);
                                const a = document.createElement("a");
                                a.href = url;
                                // Extract filename from path
                                const filename = filePath.split("/").pop() || "attachment";
                                a.download = filename;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              }
                            } catch (error: any) {
                              console.error("Error downloading file:", error);
                              // Try to get public URL and open in new tab as fallback
                              try {
                                let urlResult = supabase.storage
                                  .from(bucketName)
                                  .getPublicUrl(filePath);
                                
                                if (!urlResult.data?.publicUrl && bucketName === "web_seo_uploads") {
                                  urlResult = supabase.storage
                                    .from("seo_uploads")
                                    .getPublicUrl(filePath);
                                }

                                if (urlResult.data?.publicUrl) {
                                  window.open(urlResult.data.publicUrl, "_blank");
                                } else {
                                  window.open(attachmentUrl, "_blank");
                                }
                              } catch {
                                window.open(attachmentUrl, "_blank");
                              }
                            }
                          };

                          const handleView = async () => {
                            try {
                              // Download the file and open it in a new tab using blob URL
                              let downloadResult = await supabase.storage
                                .from(bucketName)
                                .download(filePath);

                              // If bucket name was wrong, try the other one
                              if (downloadResult.error && bucketName === "web_seo_uploads") {
                                downloadResult = await supabase.storage
                                  .from("seo_uploads")
                                  .download(filePath);
                              }

                              if (downloadResult.error) {
                                throw downloadResult.error;
                              }

                              if (downloadResult.data) {
                                // Create a blob URL and open it in a new tab
                                const blobUrl = window.URL.createObjectURL(downloadResult.data);
                                const newWindow = window.open(blobUrl, "_blank");
                                
                                // Clean up the blob URL after a delay (when the window should have loaded it)
                                if (newWindow) {
                                  setTimeout(() => {
                                    window.URL.revokeObjectURL(blobUrl);
                                  }, 1000);
                                } else {
                                  // If popup was blocked, revoke immediately and try fallback
                                  window.URL.revokeObjectURL(blobUrl);
                                  // Try to get public URL as fallback
                                  const { data: urlData } = supabase.storage
                                    .from(bucketName)
                                    .getPublicUrl(filePath);
                                  if (urlData?.publicUrl) {
                                    window.open(urlData.publicUrl, "_blank");
                                  } else {
                                    window.open(attachmentUrl, "_blank");
                                  }
                                }
                              }
                            } catch (error: any) {
                              console.error("Error viewing file:", error);
                              // Try to get public URL as fallback
                              try {
                                let urlResult = supabase.storage
                                  .from(bucketName)
                                  .getPublicUrl(filePath);
                                
                                if (!urlResult.data?.publicUrl && bucketName === "web_seo_uploads") {
                                  urlResult = supabase.storage
                                    .from("seo_uploads")
                                    .getPublicUrl(filePath);
                                }

                                if (urlResult.data?.publicUrl) {
                                  window.open(urlResult.data.publicUrl, "_blank");
                                } else {
                                  window.open(attachmentUrl, "_blank");
                                }
                              } catch {
                                window.open(attachmentUrl, "_blank");
                              }
                            }
                          };

                          return (
                            <div className="mt-1.5 p-1.5 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <Download className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  <span className="text-[11px] text-green-700 dark:text-green-300 font-medium truncate">
                                    Attachment Available
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[11px] px-2 text-white"
                                    onClick={handleView}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-6 text-[11px] px-2 bg-green-600 hover:bg-green-700"
                                    onClick={handleDownload}
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    From: {task.user?.display_name || task.user?.email || "Unknown"} ·{" "}
                    {new Date(task.created_at || task.comment_date).toLocaleString()}
                  </p>

                  {/* Comments Section */}
                  <div className="border-t pt-2 mt-2">
                    <button
                      onClick={() => {
                        setExpandedComments(prev => ({
                          ...prev,
                          [task.company_id]: !prev[task.company_id]
                        }));
                      }}
                      className="flex items-center justify-between w-full mb-1.5 hover:bg-muted/50 rounded p-1.5 -m-1.5 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        <p className="text-xs font-semibold">
                          Comments
                        </p>
                        {companyComments[task.company_id] && companyComments[task.company_id].length > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {companyComments[task.company_id].length}
                          </Badge>
                        )}
                      </div>
                      {companyComments[task.company_id] && companyComments[task.company_id].length > 0 && (
                        expandedComments[task.company_id] ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )
                      )}
                    </button>
                    {expandedComments[task.company_id] && companyComments[task.company_id] && companyComments[task.company_id].length > 0 && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto mt-1.5">
                        {companyComments[task.company_id].map((comment: any) => (
                          <div key={comment.id} className="bg-muted/50 p-2 rounded-md border border-muted">
                            {comment.comment_text ? (
                              <p className="text-xs text-muted-foreground leading-relaxed mb-1.5 break-words font-medium line-clamp-3">
                                {comment.comment_text}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground italic mb-1.5">No comment text</p>
                            )}
                            <div className="text-muted-foreground text-[10px] space-y-0.5 border-t border-muted pt-1.5 mt-1.5">
                              <p>
                                <span className="font-medium text-xs text-muted-foreground ">{comment.user?.display_name || comment.user?.email || "Unknown"}</span>
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
                    {expandedComments[task.company_id] && (!companyComments[task.company_id] || companyComments[task.company_id].length === 0) && (
                      <p className="text-xs text-muted-foreground mt-1.5">No comments yet.</p>
                    )}
                  </div>

                  {/* Add Comment Section */}
                  <div className="border-t pt-2 mt-2 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      Add Comment
                    </label>
                    <Textarea
                      placeholder="Type your comment here..."
                      value={commentTexts[task.company_id] || ""}
                      onChange={(e) =>
                        setCommentTexts((prev) => ({
                          ...prev,
                          [task.company_id]: e.target.value,
                        }))
                      }
                      className="min-h-[60px] max-h-[80px] text-xs resize-none bg-background text-white placeholder:text-white/60"
                      disabled={savingComments[task.company_id]}
                    />
                    <Button
                      onClick={async () => {
                        const commentText = commentTexts[task.company_id]?.trim() || "";
                        if (!commentText) return;

                        setSavingComments({ ...savingComments, [task.company_id]: true });

                        try {
                          const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
                          if (authError || !authUser) {
                            throw new Error("Not authenticated. Please log in again.");
                          }

                          const { error } = await supabase
                            .from("comments")
                            .insert([
                              {
                                company_id: task.company_id,
                                user_id: authUser.id,
                                comment_text: commentText,
                                category: "seo" as any,
                                comment_date: new Date().toISOString(),
                              },
                            ]);

                          if (error) throw error;

                          toast.success("Comment added successfully");
                          setCommentTexts((prev) => ({
                            ...prev,
                            [task.company_id]: "",
                          }));

                          // Refresh comments
                          const { data: updatedComments } = await supabase
                            .from("comments" as any)
                            .select(`
                              id,
                              comment_text,
                              comment_date,
                              created_at,
                              company_id,
                              category,
                              user_id,
                              user:profiles!user_id(
                                display_name,
                                email
                              )
                            ` as any)
                            .eq("company_id", task.company_id)
                            .order("created_at", { ascending: false });

                          if (updatedComments) {
                            setCompanyComments((prev) => ({
                              ...prev,
                              [task.company_id]: updatedComments,
                            }));
                          }
                        } catch (error: any) {
                          console.error("Error adding comment:", error);
                          toast.error(error.message || "Failed to add comment");
                        } finally {
                          setSavingComments({ ...savingComments, [task.company_id]: false });
                        }
                      }}
                      disabled={!commentTexts[task.company_id]?.trim() || savingComments[task.company_id]}
                      size="sm"
                      className="w-full h-7 text-xs"
                    >
                      {savingComments[task.company_id] ? (
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
                  
                  {/* Task Completion Section */}
                  <div className="border-t pt-3 mt-2 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium ">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      <span>Mark Task as Complete</span>
                    </div>
                    <Textarea
                      placeholder="Add completion notes (optional)..."
                      value={completionComments[task.id] || ""}
                      onChange={(e) =>
                        setCompletionComments({
                          ...completionComments,
                          [task.id]: e.target.value,
                        })
                      }
                      className="min-h-[60px] max-h-[80px] text-xs bg-background placeholder:text-white/60 resize-none"
                    />
                    <Button
                      size="sm"
                      className="w-full bg-green-600 hover:bg-green-700 h-8 text-xs"
                      onClick={async () => {
                        const commentText = completionComments[task.id]?.trim() || "";
                        const completionNote = commentText
                          ? `TASK_COMPLETED: ${commentText}`
                          : "TASK_COMPLETED: Task completed by SEO/Website team";

                        setCompletingTasks({ ...completingTasks, [task.id]: true });

                        try {
                          // Get the authenticated user to ensure RLS policy allows the insert
                          const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
                          
                          if (authError || !authUser) {
                            throw new Error("Not authenticated. Please log in again.");
                          }

                          const { error } = await supabase
                            .from("comments")
                            .insert([
                              {
                                company_id: task.company_id,
                                user_id: authUser.id, // Use authenticated user's ID for RLS policy
                                comment_text: completionNote,
                                category: "seo" as any,
                                comment_date: new Date().toISOString(),
                              },
                            ]);

                          if (error) throw error;

                          toast.success("Task marked as complete! It will be removed from your dashboard.");
                          
                          // Remove the task from the list immediately by filtering it out
                          // Also filter out any other tasks for the same company since completion marks the company as done
                          setTasks(prevTasks => prevTasks.filter((t) => 
                            t.id !== task.id && t.company_id !== task.company_id
                          ));
                          
                          setCompletionComments({
                            ...completionComments,
                            [task.id]: "",
                          });
                          
                          // Trigger a custom event to notify Paid Client Pool to refresh
                          window.dispatchEvent(new CustomEvent('seoTaskCompleted', { 
                            detail: { companyId: task.company_id } 
                          }));
                        } catch (error: any) {
                          console.error("Error completing task:", error);
                          toast.error(error.message || "Failed to mark task as complete");
                        } finally {
                          setCompletingTasks({ ...completingTasks, [task.id]: false });
                        }
                      }}
                      disabled={completingTasks[task.id]}
                    >
                      {completingTasks[task.id] ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Completing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Mark as Complete
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SeoTasksView;


