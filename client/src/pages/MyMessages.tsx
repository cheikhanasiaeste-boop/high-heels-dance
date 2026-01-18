import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Mail, MailOpen, Clock, Send, Inbox, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function MyMessages() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  
  const { data: messages = [] } = trpc.messages.myMessages.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const [selectedMessage, setSelectedMessage] = useState<typeof messages[0] | null>(null);

  const markAsReadMutation = trpc.messages.markAsRead.useMutation({
    onSuccess: () => {
      utils.messages.myMessages.invalidate();
      utils.messages.unreadCount.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to mark message as read");
    },
  });

  const handleMessageClick = (message: typeof messages[0]) => {
    setSelectedMessage(message);
    if (!message.isRead) {
      markAsReadMutation.mutate({ messageId: message.id });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
            <CardDescription>Please log in to view your messages</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = getLoginUrl()} className="w-full">
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const unreadCount = messages.filter(m => !m.isRead).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900">
      <div className="container max-w-4xl py-8">
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
            My Messages
          </h1>
          <p className="text-muted-foreground mt-2">
            {unreadCount > 0 ? `You have ${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}` : 'All messages read'}
          </p>
        </div>

        {messages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No messages yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <Card
                key={message.id}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  !message.isRead ? 'border-pink-300 bg-pink-50/50 dark:bg-pink-900/10' : ''
                }`}
                onClick={() => handleMessageClick(message)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {message.isRead ? (
                          <MailOpen className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <Mail className="h-5 w-5 text-pink-600" />
                        )}
                        <CardTitle className="text-lg">{message.subject}</CardTitle>
                        {!message.isRead && message.toUserId === user?.id && (
                          <Badge variant="default" className="bg-pink-600">
                            New
                          </Badge>
                        )}
                        {message.fromUserId === user?.id ? (
                          <Badge variant="outline" className="border-blue-500 text-blue-600">
                            <Send className="h-3 w-3 mr-1" />
                            Sent
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-green-500 text-green-600">
                            <Inbox className="h-3 w-3 mr-1" />
                            Received
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{new Date(message.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-2">{message.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Message Detail Modal */}
        {selectedMessage && (
          <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{selectedMessage.subject}</DialogTitle>
                <DialogDescription>
                  {selectedMessage.fromUserId === user?.id ? 'Sent' : 'Received'} on {new Date(selectedMessage.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="whitespace-pre-wrap">{selectedMessage.body}</p>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
