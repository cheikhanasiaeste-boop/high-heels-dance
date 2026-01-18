import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send, MessageSquare, ArrowLeft } from "lucide-react";

export default function Conversations() {
  const { user } = useAuth();
  if (!user) return null;
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newMessageSubject, setNewMessageSubject] = useState("");
  const [newMessageBody, setNewMessageBody] = useState("");
  const [replyBody, setReplyBody] = useState("");

  const conversationsQuery = trpc.messages.conversations.useQuery();
  const threadQuery = trpc.messages.thread.useQuery(
    { otherUserId: selectedConversation! },
    { enabled: !!selectedConversation }
  );
  const sendMutation = trpc.messages.send.useMutation();
  const markAsReadMutation = trpc.messages.markAsRead.useMutation();
  const utils = trpc.useUtils();
  
  // Get admin user ID (first admin user)
  const adminUserId = 124298; // TODO: Get this dynamically from backend

  const handleSendNewMessage = async () => {
    if (!newMessageSubject.trim() || !newMessageBody.trim()) return;

    try {
      await sendMutation.mutateAsync({
        toUserId: adminUserId,
        subject: newMessageSubject,
        body: newMessageBody,
      });

      setNewMessageSubject("");
      setNewMessageBody("");
      setShowNewConversation(false);
      await utils.messages.conversations.invalidate();
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleSendReply = async () => {
    if (!replyBody.trim() || !selectedConversation) return;

    try {
      await sendMutation.mutateAsync({
        toUserId: selectedConversation,
        subject: "Re: " + (threadQuery.data?.[0]?.subject || ""),
        body: replyBody,
      });

      setReplyBody("");
      await utils.messages.thread.invalidate({ otherUserId: selectedConversation });
      await utils.messages.conversations.invalidate();
    } catch (error) {
      console.error("Failed to send reply:", error);
    }
  };

  if (!user) return null;

  // Show conversation thread
  if (selectedConversation && threadQuery.data) {
    const conversation = conversationsQuery.data?.find(
      (c) => c.otherUserId === selectedConversation
    );

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedConversation(null)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">
              {conversation?.displayName || "Conversation"}
            </h1>
          </div>

          {/* Messages */}
          <div className="space-y-4 mb-6 max-h-[500px] overflow-y-auto">
            {threadQuery.data.map((msg) => (
              <div
                key={msg.id}
                className={`p-4 rounded-lg ${
                  msg.fromUserId === user.id
                    ? "bg-purple-100 ml-8 text-right"
                    : "bg-white border border-gray-200 mr-8"
                }`}
              >
                <p className="text-sm font-semibold text-gray-600 mb-2">
                  {msg.fromUserId === user.id ? "You" : conversation?.displayName}
                </p>
                <p className="font-semibold text-gray-900">{msg.subject}</p>
                <p className="text-gray-700 mt-2">{msg.body}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(msg.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* Reply Box */}
          <Card className="p-4">
            <Textarea
              placeholder="Type your reply..."
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              className="mb-3"
              rows={3}
            />
            <Button
              onClick={handleSendReply}
              disabled={!replyBody.trim() || sendMutation.isPending}
              className="w-full"
            >
              <Send className="w-4 h-4 mr-2" />
              Send Reply
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Show new conversation form
  if (showNewConversation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewConversation(false)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">New Message to Elizabeth</h1>
          </div>

          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Subject
                </label>
                <Input
                  placeholder="Message subject"
                  value={newMessageSubject}
                  onChange={(e) => setNewMessageSubject(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Message
                </label>
                <Textarea
                  placeholder="Type your message..."
                  value={newMessageBody}
                  onChange={(e) => setNewMessageBody(e.target.value)}
                  rows={6}
                />
              </div>

              <Button
                onClick={handleSendNewMessage}
                disabled={!newMessageSubject.trim() || !newMessageBody.trim() || sendMutation.isPending}
                className="w-full"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Show conversations list
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Conversations</h1>
          <Button
            onClick={() => setShowNewConversation(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            New Message
          </Button>
        </div>

        {conversationsQuery.isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading conversations...</p>
          </div>
        ) : conversationsQuery.data && conversationsQuery.data.length > 0 ? (
          <div className="space-y-3">
            {conversationsQuery.data.map((conv) => (
              <Card
                key={conv.otherUserId}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedConversation(conv.otherUserId)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-purple-600" />
                      {conv.displayName}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {conv.lastMessageSubject}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(conv.lastMessageDate).toLocaleString()}
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-xs font-semibold text-white bg-red-500 rounded-full ml-4">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No conversations yet</p>
            <Button
              onClick={() => setShowNewConversation(true)}
              variant="outline"
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              Start a conversation with Elizabeth
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
