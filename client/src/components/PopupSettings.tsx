import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PopupSettings() {
  const utils = trpc.useUtils();
  const { data: popupData } = trpc.admin.popup.get.useQuery();

  const [enabled, setEnabled] = useState(false);
  const [type, setType] = useState<'email_collection' | 'announcement' | 'custom'>('announcement');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttonText, setButtonText] = useState('Got it');
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailPlaceholder, setEmailPlaceholder] = useState('Enter your email');

  useEffect(() => {
    if (popupData) {
      setEnabled(popupData.enabled);
      setType(popupData.type);
      setTitle(popupData.title);
      setMessage(popupData.message);
      setButtonText(popupData.buttonText);
      setShowEmailInput(popupData.showEmailInput);
      setEmailPlaceholder(popupData.emailPlaceholder || 'Enter your email');
    }
  }, [popupData]);

  const upsertMutation = trpc.admin.popup.upsert.useMutation({
    onSuccess: () => {
      toast.success("Popup settings saved successfully!");
      utils.admin.popup.get.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save popup settings");
    },
  });

  const handleSave = () => {
    upsertMutation.mutate({
      enabled,
      type,
      title,
      message,
      buttonText,
      showEmailInput,
      emailPlaceholder,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch
          id="popup-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Label htmlFor="popup-enabled">Enable Popup</Label>
      </div>

      <div>
        <Label htmlFor="popup-type">Popup Type</Label>
        <Select value={type} onValueChange={(value: any) => setType(value)}>
          <SelectTrigger id="popup-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="announcement">Announcement</SelectItem>
            <SelectItem value="email_collection">Email Collection</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="popup-title">Title</Label>
        <Input
          id="popup-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Welcome to our site!"
        />
      </div>

      <div>
        <Label htmlFor="popup-message">Message</Label>
        <Textarea
          id="popup-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter your popup message..."
          rows={4}
        />
      </div>

      <div>
        <Label htmlFor="popup-button">Button Text</Label>
        <Input
          id="popup-button"
          value={buttonText}
          onChange={(e) => setButtonText(e.target.value)}
          placeholder="Got it"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="show-email"
          checked={showEmailInput}
          onCheckedChange={setShowEmailInput}
        />
        <Label htmlFor="show-email">Show Email Input Field</Label>
      </div>

      {showEmailInput && (
        <div>
          <Label htmlFor="email-placeholder">Email Placeholder</Label>
          <Input
            id="email-placeholder"
            value={emailPlaceholder}
            onChange={(e) => setEmailPlaceholder(e.target.value)}
            placeholder="Enter your email"
          />
        </div>
      )}

      <Button onClick={handleSave} disabled={upsertMutation.isPending}>
        {upsertMutation.isPending ? "Saving..." : "Save Popup Settings"}
      </Button>
    </div>
  );
}
