import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface MessageComposeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: number;
  recipientName: string;
  recipientEmail: string;
}

export function MessageComposeModal({
  open,
  onOpenChange,
  recipientId,
  recipientName,
  recipientEmail,
}: MessageComposeModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const utils = trpc.useUtils();

  const sendMessageMutation = trpc.messages.sendToUser.useMutation({
    onSuccess: () => {
      toast.success("Message sent successfully!");
      setSubject("");
      setBody("");
      onOpenChange(false);
      // Invalidate myMessages query so sent message appears immediately
      utils.messages.myMessages.invalidate();
    },
    onError: (error: any) => {
      toast.error(`Failed to send message: ${error.message}`);
    },
  });

  const handleSend = () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Please enter a message");
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
          <DialogTitle>Send Message</DialogTitle>
          <DialogDescription>
            Send an internal message to {recipientName} ({recipientEmail})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Enter message subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Enter your message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
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
            disabled={sendMessageMutation.isPending}
          >
            {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
