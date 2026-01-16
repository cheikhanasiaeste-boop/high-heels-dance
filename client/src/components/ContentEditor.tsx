import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Save } from "lucide-react";

export function ContentEditor() {
  const utils = trpc.useUtils();
  
  // Fetch current content
  const { data: heroTitle } = trpc.admin.content.get.useQuery({ key: 'hero_title' });
  const { data: heroTagline } = trpc.admin.content.get.useQuery({ key: 'hero_tagline' });
  const { data: coursesHeading } = trpc.admin.content.get.useQuery({ key: 'courses_heading' });
  const { data: testimonialsHeading } = trpc.admin.content.get.useQuery({ key: 'testimonials_heading' });
  
  const [content, setContent] = useState({
    hero_title: '',
    hero_tagline: '',
    courses_heading: '',
    testimonials_heading: '',
  });

  useEffect(() => {
    setContent({
      hero_title: heroTitle || 'Elizabeth Zolotova',
      hero_tagline: heroTagline || "I'm a Pro dancer and dance teacher who can make you fall in love with dance...",
      courses_heading: coursesHeading || 'Dance Courses',
      testimonials_heading: testimonialsHeading || 'Student Testimonials',
    });
  }, [heroTitle, heroTagline, coursesHeading, testimonialsHeading]);

  const updateContentMutation = trpc.admin.content.update.useMutation({
    onSuccess: () => {
      toast.success("Content updated successfully!");
      utils.admin.content.get.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update content");
    },
  });

  const handleSave = (key: string, value: string) => {
    updateContentMutation.mutate({ key, value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Website Content</CardTitle>
        <CardDescription>Edit text content displayed on your website</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hero Section */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h3 className="font-semibold text-lg">Hero Section</h3>
          
          <div className="space-y-2">
            <Label htmlFor="hero_title">Your Name / Title</Label>
            <div className="flex gap-2">
              <Input
                id="hero_title"
                value={content.hero_title}
                onChange={(e) => setContent({ ...content, hero_title: e.target.value })}
                placeholder="Elizabeth Zolotova"
              />
              <Button
                size="sm"
                onClick={() => handleSave('hero_title', content.hero_title)}
                disabled={updateContentMutation.isPending}
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hero_tagline">Tagline / Description</Label>
            <div className="flex gap-2">
              <Textarea
                id="hero_tagline"
                value={content.hero_tagline}
                onChange={(e) => setContent({ ...content, hero_tagline: e.target.value })}
                placeholder="I'm a Pro dancer and dance teacher..."
                rows={3}
              />
              <Button
                size="sm"
                onClick={() => handleSave('hero_tagline', content.hero_tagline)}
                disabled={updateContentMutation.isPending}
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Section Headings */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h3 className="font-semibold text-lg">Section Headings</h3>
          
          <div className="space-y-2">
            <Label htmlFor="courses_heading">Courses Section Heading</Label>
            <div className="flex gap-2">
              <Input
                id="courses_heading"
                value={content.courses_heading}
                onChange={(e) => setContent({ ...content, courses_heading: e.target.value })}
                placeholder="Dance Courses"
              />
              <Button
                size="sm"
                onClick={() => handleSave('courses_heading', content.courses_heading)}
                disabled={updateContentMutation.isPending}
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="testimonials_heading">Testimonials Section Heading</Label>
            <div className="flex gap-2">
              <Input
                id="testimonials_heading"
                value={content.testimonials_heading}
                onChange={(e) => setContent({ ...content, testimonials_heading: e.target.value })}
                placeholder="Student Testimonials"
              />
              <Button
                size="sm"
                onClick={() => handleSave('testimonials_heading', content.testimonials_heading)}
                disabled={updateContentMutation.isPending}
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
