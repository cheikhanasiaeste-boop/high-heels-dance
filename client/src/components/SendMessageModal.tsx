import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Send } from "lucide-react";

interface SendMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: number;
  recipientName: string;
}

export function SendMessageModal({ open, onOpenChange, recipientId, recipientName }: SendMessageModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const sendMessageMutation = trpc.messages.sendToUser.useMutation({
    onSuccess: () => {
      toast.success(`Message sent to ${recipientName}!`);
      setSubject("");
      setBody("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send message");
    },
  });

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Please fill in both subject and message");
      return;
    }

    sendMessageMutation.mutate({
      toUserId: recipientId,
      subject: subject.trim(),
      body: body.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Message to {recipientName}</DialogTitle>
          <DialogDescription>
            Send an internal message that will appear in the user's "My Messages" section
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Enter message subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Type your message here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sendMessageMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendMessageMutation.isPending || !subject.trim() || !body.trim()}
          >
            <Send className="h-4 w-4 mr-2" />
            {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
