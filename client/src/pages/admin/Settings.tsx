import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { ContentEditor } from "@/components/ContentEditor";
import { PopupSettings } from "@/components/PopupSettings";

export default function AdminSettings() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  
  const { data: bannerData } = trpc.admin.banner.get.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const { data: bgAnimationData } = trpc.admin.settings.get.useQuery(
    { key: 'backgroundAnimationUrl' },
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  
  // Backward compatibility: also check old backgroundVideoUrl
  const { data: bgVideoData } = trpc.admin.settings.get.useQuery(
    { key: 'backgroundVideoUrl' },
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const [bannerText, setBannerText] = useState(bannerData?.text || "");
  const [bannerEnabled, setBannerEnabled] = useState(bannerData?.enabled || false);
  const [bgVideoUrl, setBgVideoUrl] = useState("");

  // Update bgVideoUrl when data loads (prioritize new animation format)
  if ((bgAnimationData || bgVideoData) && bgVideoUrl === "") {
    setBgVideoUrl(bgAnimationData || bgVideoData || "");
  }
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  const uploadMutation = trpc.upload.useMutation();
  const updateVideoMutation = trpc.admin.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Background animation updated successfully!");
      utils.admin.settings.get.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update background animation");
    },
  });

  const updateBannerMutation = trpc.admin.banner.update.useMutation({
    onSuccess: () => {
      toast.success("Banner updated successfully!");
      utils.admin.banner.get.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update banner");
    },
  });

  const handleUpdateBanner = () => {
    updateBannerMutation.mutate({
      text: bannerText,
      enabled: bannerEnabled,
    });
  };

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <AdminLayout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">Access denied</p>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Site Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your website configuration</p>
        </div>

        {/* Popup Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Website Popup</CardTitle>
            <CardDescription>Configure popup for email collection or announcements</CardDescription>
          </CardHeader>
          <CardContent>
            <PopupSettings />
          </CardContent>
        </Card>

        {/* Banner Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Announcement Banner</CardTitle>
            <CardDescription>Display a promotional message at the top of your site</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="banner-enabled"
                checked={bannerEnabled}
                onCheckedChange={setBannerEnabled}
              />
              <Label htmlFor="banner-enabled">Enable Banner</Label>
            </div>
            <div>
              <Label htmlFor="banner-text">Banner Text</Label>
              <Input
                id="banner-text"
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                placeholder="e.g., Special discount: 50% off all courses!"
              />
            </div>
            <Button onClick={handleUpdateBanner}>Save Banner Settings</Button>
          </CardContent>
        </Card>

        {/* Background Animation Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Homepage Background Animation</CardTitle>
            <CardDescription>
              Upload an animated WebP to display as a subtle background animation in the courses section.
              For best performance, keep file size under 2MB. Recommended dimensions: 1920x1080px.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="bg-animation">Background Animation</Label>
              <Input
                id="bg-animation"
                type="file"
                accept="image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  // Validate file size (2MB limit)
                  if (file.size > 2 * 1024 * 1024) {
                    toast.error("File size must be under 2MB for optimal performance");
                    return;
                  }
                  
                  setIsUploadingVideo(true);
                  try {
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const base64 = reader.result as string;
                      const result = await uploadMutation.mutateAsync({ 
                        key: `animations/background-${Date.now()}.webp`,
                        data: base64,
                        contentType: file.type
                      });
                      setBgVideoUrl(result.url);
                      await updateVideoMutation.mutateAsync({
                        key: 'backgroundAnimationUrl',
                        value: result.url,
                      });
                      toast.success("Animation uploaded successfully!");
                    };
                    reader.readAsDataURL(file);
                  } catch (error) {
                    toast.error("Failed to upload animation");
                  } finally {
                    setIsUploadingVideo(false);
                  }
                }}
                disabled={isUploadingVideo}
              />
              {isUploadingVideo && <p className="text-sm text-muted-foreground mt-2">Uploading animation...</p>}
              {bgVideoUrl && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-2">Current animation preview:</p>
                  <img 
                    src={bgVideoUrl} 
                    alt="Background animation preview" 
                    className="w-full max-w-md rounded-lg border border-border" 
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    The animation will appear more subtle on the homepage with automatic color adjustments.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Page Content */}
        <Card>
          <CardHeader>
            <CardTitle>Page Content</CardTitle>
            <CardDescription>Edit homepage sections and content</CardDescription>
          </CardHeader>
          <CardContent>
            <ContentEditor />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
