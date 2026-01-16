import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PopupSettings() {
  const utils = trpc.useUtils();
  const { data: popupData } = trpc.admin.popup.get.useQuery();

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [buttonText, setButtonText] = useState('Got it');
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailPlaceholder, setEmailPlaceholder] = useState('Enter your email');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (popupData) {
      setEnabled(popupData.enabled);
      setTitle(popupData.title);
      setMessage(popupData.message);
      setImageUrl(popupData.imageUrl || '');
      setButtonText(popupData.buttonText);
      setShowEmailInput(popupData.showEmailInput);
      setEmailPlaceholder(popupData.emailPlaceholder || 'Enter your email');
    }
  }, [popupData]);

  const uploadMutation = trpc.upload.useMutation({
    onSuccess: (data: any) => {
      setImageUrl(data.url);
      toast.success("Image uploaded successfully!");
      setUploading(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to upload image");
      setUploading(false);
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1]; // Remove data:image/...;base64, prefix
      const key = `popup-images/${Date.now()}-${file.name}`;
      uploadMutation.mutate({ 
        key, 
        data: base64Data,
        contentType: file.type 
      });
    };
    reader.readAsDataURL(file);
  };

  const upsertMutation = trpc.admin.popup.upsert.useMutation({
    onSuccess: () => {
      toast.success("Popup settings saved successfully!");
      utils.admin.popup.get.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save popup settings");
    },
  });

  const handleSave = () => {
    upsertMutation.mutate({
      enabled,
      title,
      message,
      imageUrl: imageUrl || null,
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
        <Label htmlFor="popup-image">Popup Image (optional)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="popup-image"
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={uploading}
            className="flex-1"
          />
          {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
        </div>
        {imageUrl && (
          <div className="mt-2">
            <img src={imageUrl} alt="Popup preview" className="max-w-xs rounded border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImageUrl('')}
              className="mt-1"
            >
              Remove Image
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          Upload an image or GIF to display in the popup
        </p>
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
