import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RequestDataViewProps {
  userId: string;
}

const RequestDataView = ({ userId }: RequestDataViewProps) => {
  const [loading, setLoading] = useState(false);
  const [requestType, setRequestType] = useState<string>("general");
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    fetchRequests();
  }, [userId]);

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from("data_requests")
      .select("*, requested_from:profiles!requested_from_id(display_name)")
      .eq("requested_by_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRequests(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Auto-generate message based on request type
      const requestMessage = requestType === "facebook" 
        ? "[Facebook Data Request] Requesting Facebook data"
        : "General data request";

      const { error } = await supabase.from("data_requests").insert([
        {
          requested_by_id: userId,
          message: requestMessage,
          status: "pending",
        },
      ]);

      if (error) throw error;

      toast.success("Request sent successfully!");
      setRequestType("general");
      fetchRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to send request");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFacebookRequest = () => {
    setRequestType("facebook");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-white">Request Data</h2>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Send New Request</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4 text-white">
              <div className="space-y-2">
                <Label htmlFor="requestType">Request Type</Label>
                <Select value={requestType} onValueChange={setRequestType}>
                  <SelectTrigger id="requestType">
                    <SelectValue placeholder="Select request type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general" >General Data Request</SelectItem>
                    <SelectItem value="facebook">Facebook Data Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {requestType === "facebook" && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Share2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                      Facebook Data Request
                    </span>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    This request will be specifically for Facebook source data.
                  </p>
                </div>
              )}

              {requestType === "general" && (
                <div className="p-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg">
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    This is a general data request.
                  </p>
                </div>
              )}
              
              <div className="flex gap-2 ">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Request"
                  )}
                </Button>
                {requestType === "general" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleQuickFacebookRequest}
                    className="flex items-center gap-2 text-white"
                  >
                    <Share2 className="h-4 w-4 text-white" />
                    Facebook
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requests.length === 0 ? (
                <p className="text-muted-foreground text-sm">No requests yet.</p>
              ) : (
                requests.map((request) => {
                  const isFacebookRequest = request.message?.includes("[Facebook Data Request]");
                  
                  return (
                    <div key={request.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              request.status === "approved"
                                ? "default"
                                : request.status === "rejected"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {request.status}
                          </Badge>
                          {isFacebookRequest && (
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Share2 className="h-3 w-3" />
                              Facebook
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(request.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm">{isFacebookRequest ? "Facebook Data Request" : "General Data Request"}</p>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RequestDataView;
