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

  const { data: heroProfilePictureData } = trpc.admin.settings.get.useQuery(
    { key: 'heroProfilePictureUrl' },
    { enabled: isAuthenticated && user?.role === 'admin' }
  );



  const [bannerText, setBannerText] = useState(bannerData?.text || "");
  const [bannerEnabled, setBannerEnabled] = useState(bannerData?.enabled || false);
  const [heroBackgroundUrl, setHeroBackgroundUrl] = useState("");
  const [heroProfilePictureUrl, setHeroProfilePictureUrl] = useState("");
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [uploadingProfile, setUploadingProfile] = useState(false);

  useEffect(() => {
    if (heroBackgroundData) {
      setHeroBackgroundUrl(heroBackgroundData);
    }
  }, [heroBackgroundData]);

  useEffect(() => {
    if (heroProfilePictureData) {
      setHeroProfilePictureUrl(heroProfilePictureData);
    }
  }, [heroProfilePictureData]);



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

  const uploadImageMutation = trpc.admin.media.uploadImage.useMutation();

  const handleBackgroundFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate animated WebP performance specs
    const isAnimatedWebP = file.type === 'image/webp' && file.name.toLowerCase().endsWith('.webp');
    
    if (isAnimatedWebP) {
      // File size validation (max 5MB for smooth performance)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast.error(
          `Animated WebP is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). ` +
          `Maximum recommended size is 5MB for smooth playback. ` +
          `Please optimize your file with lower frame count, reduced resolution, or better compression.`,
          { duration: 8000 }
        );
        return;
      }

      // Warning for files between 2-5MB
      if (file.size > 2 * 1024 * 1024) {
        toast.warning(
          `Large animated WebP detected (${(file.size / 1024 / 1024).toFixed(2)}MB). ` +
          `For best performance, keep files under 2MB. ` +
          `Recommended specs: 1920x1080 max, 15-20 FPS, 2-3 second loop.`,
          { duration: 6000 }
        );
      }
    }

    setUploadingBackground(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result?.toString().split(',')[1];
        if (!base64) throw new Error('Failed to read file');

        const result = await uploadImageMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileData: base64,
        });

        await updateHeroBackgroundMutation.mutateAsync({
          key: 'heroBackgroundUrl',
          value: result.url,
        });

        setHeroBackgroundUrl(result.url);
        toast.success('Hero background uploaded successfully!');
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload background');
    } finally {
      setUploadingBackground(false);
    }
  };

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingProfile(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result?.toString().split(',')[1];
        if (!base64) throw new Error('Failed to read file');

        const result = await uploadImageMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileData: base64,
        });

        await updateHeroBackgroundMutation.mutateAsync({
          key: 'heroProfilePictureUrl',
          value: result.url,
        });

        setHeroProfilePictureUrl(result.url);
        toast.success('Profile picture uploaded successfully!');
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload profile picture');
    } finally {
      setUploadingProfile(false);
    }
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
            <CardDescription>Upload the homepage hero section background image</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hero-background-file">Background Image</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="hero-background-file"
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundFileUpload}
                  disabled={uploadingBackground}
                />
                {heroBackgroundUrl && (
                  <img
                    src={heroBackgroundUrl}
                    alt="Hero background preview"
                    className="w-24 h-24 object-cover rounded border"
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {uploadingBackground ? 'Uploading...' : 'Choose an image file (WebP, JPG, or PNG). For best results, use a high-resolution image.'}
              </p>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 mb-1">📊 Animated WebP Performance Specs</p>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• <strong>File Size:</strong> Under 2MB (optimal), max 5MB</li>
                  <li>• <strong>Resolution:</strong> 1920x1080 or lower</li>
                  <li>• <strong>Frame Rate:</strong> 15-20 FPS (avoid 30+ FPS)</li>
                  <li>• <strong>Duration:</strong> 2-3 second loop recommended</li>
                  <li>• <strong>Compression:</strong> Use lossy WebP with quality 75-85</li>
                </ul>
                <p className="text-xs text-blue-700 mt-2 italic">
                  Files exceeding these specs may cause visible lag or stuttering.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hero Profile Picture Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Hero Profile Picture</CardTitle>
            <CardDescription>Upload the round profile picture in the hero section</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hero-profile-file">Profile Picture</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="hero-profile-file"
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureUpload}
                  disabled={uploadingProfile}
                />
                {heroProfilePictureUrl && (
                  <img
                    src={heroProfilePictureUrl}
                    alt="Profile picture preview"
                    className="w-24 h-24 object-cover rounded-full border"
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {uploadingProfile ? 'Uploading...' : 'Choose an image file for the profile picture. Will be displayed as a circle.'}
              </p>
            </div>
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
