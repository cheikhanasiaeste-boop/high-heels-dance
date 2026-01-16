import { useState } from "react";
import { AIChatBox, Message } from "./AIChatBox";
import { trpc } from "@/lib/trpc";
import { X } from "lucide-react";
import { Button } from "./ui/button";

type ChatWidgetProps = {
  onClose: () => void;
};

export default function ChatWidget({ onClose }: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm here to help you with any questions about our dance courses. How can I assist you today?",
    },
  ]);

  const chatMutation = trpc.chat.send.useMutation({
    onSuccess: (response) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.message,
        },
      ]);
    },
    onError: (error) => {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm sorry, I encountered an error. Please try again.",
        },
      ]);
    },
  });

  const handleSend = (content: string) => {
    const newUserMessage: Message = { role: "user", content };
    setMessages((prev) => [...prev, newUserMessage]);

    // Send to backend with history
    const history = messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

    chatMutation.mutate({
      message: content,
      history,
    });
  };

  return (
    <div className="bg-card border rounded-lg shadow-xl flex flex-col h-[500px]">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Chat Support</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <AIChatBox
        messages={messages}
        onSendMessage={handleSend}
        isLoading={chatMutation.isPending}
        placeholder="Ask about courses, pricing, or anything else..."
        height="100%"
        suggestedPrompts={[
          "What courses do you offer?",
          "How much do courses cost?",
          "Do you have beginner-friendly courses?",
          "What's your refund policy?",
        ]}
      />
    </div>
  );
}
