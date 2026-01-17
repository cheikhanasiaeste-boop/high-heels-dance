import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
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

  const { data: heroBackgroundData } = trpc.admin.settings.get.useQuery(
    { key: 'heroBackgroundUrl' },
    { enabled: isAuthenticated && user?.role === 'admin' }
  );



  const [bannerText, setBannerText] = useState(bannerData?.text || "");
  const [bannerEnabled, setBannerEnabled] = useState(bannerData?.enabled || false);
  const [heroBackgroundUrl, setHeroBackgroundUrl] = useState("");

  useEffect(() => {
    if (heroBackgroundData) {
      setHeroBackgroundUrl(heroBackgroundData);
    }
  }, [heroBackgroundData]);



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

  const updateHeroBackgroundMutation = trpc.admin.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Hero background updated successfully!");
      utils.admin.settings.get.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update hero background");
    },
  });

  const handleUpdateHeroBackground = () => {
    updateHeroBackgroundMutation.mutate({
      key: 'heroBackgroundUrl',
      value: heroBackgroundUrl,
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

        {/* Hero Background Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Hero Background</CardTitle>
            <CardDescription>Set the homepage hero section background image URL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hero-background-url">Background Image URL</Label>
              <Input
                id="hero-background-url"
                value={heroBackgroundUrl}
                onChange={(e) => setHeroBackgroundUrl(e.target.value)}
                placeholder="https://example.com/background.webp"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Enter a direct URL to an image (WebP, JPG, or PNG). For best results, use a high-resolution image.
              </p>
            </div>
            <Button onClick={handleUpdateHeroBackground}>Save Hero Background</Button>
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
