import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function AdminCourses() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);

  const { data: courses, isLoading } = trpc.admin.courses.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const createMutation = trpc.admin.courses.create.useMutation({
    onSuccess: () => {
      toast.success("Course created successfully!");
      utils.admin.courses.list.invalidate();
      utils.courses.list.invalidate();
      setCourseDialogOpen(false);
      setEditingCourse(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create course");
    },
  });

  const updateMutation = trpc.admin.courses.update.useMutation({
    onSuccess: () => {
      toast.success("Course updated successfully!");
      utils.admin.courses.list.invalidate();
      utils.courses.list.invalidate();
      setCourseDialogOpen(false);
      setEditingCourse(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update course");
    },
  });

  const deleteMutation = trpc.admin.courses.delete.useMutation({
    onSuccess: () => {
      toast.success("Course deleted successfully!");
      utils.admin.courses.list.invalidate();
      utils.courses.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete course");
    },
  });

  const uploadMutation = trpc.upload.useMutation({
    onSuccess: (data) => {
      setEditingCourse((prev: any) => ({
        ...prev,
        imageUrl: data.url,
        imageKey: data.key,
      }));
      toast.success("Image uploaded successfully!");
      setUploading(false);
    },
    onError: (error) => {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
      setUploading(false);
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      const binary = Array.from(buffer).map(b => String.fromCharCode(b)).join('');
      const base64Data = btoa(binary);
      
      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `courses/${Date.now()}-${randomSuffix}-${file.name}`;

      uploadMutation.mutate({
        key: fileKey,
        data: base64Data,
        contentType: file.type,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("Failed to process image");
      setUploading(false);
    }
  };

  const handleSaveCourse = () => {
    if (!editingCourse) return;

    const courseData = {
      title: editingCourse.title,
      description: editingCourse.description,
      price: editingCourse.price || "0",
      originalPrice: editingCourse.originalPrice || undefined,
      imageUrl: editingCourse.imageUrl || undefined,
      imageKey: editingCourse.imageKey || undefined,
      isFree: editingCourse.isFree || false,
      isPublished: editingCourse.isPublished !== false,
      isTopPick: editingCourse.isTopPick || false,
    };

    if (editingCourse.id) {
      updateMutation.mutate({ id: editingCourse.id, ...courseData });
    } else {
      createMutation.mutate(courseData);
    }
  };

  const handleDeleteCourse = (id: number) => {
    if (confirm("Are you sure you want to delete this course?")) {
      deleteMutation.mutate({ id });
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Courses</h1>
            <p className="text-muted-foreground mt-2">Manage your dance courses</p>
          </div>
          <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingCourse({})}>
                <Plus className="mr-2 h-4 w-4" />
                Add Course
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCourse?.id ? "Edit Course" : "Create New Course"}</DialogTitle>
                <DialogDescription>
                  {editingCourse?.id ? "Update course details" : "Add a new dance course"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={editingCourse?.title || ""}
                    onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                    placeholder="Course title"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={editingCourse?.description || ""}
                    onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                    placeholder="Course description"
                    rows={4}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isFree"
                    checked={editingCourse?.isFree || false}
                    onCheckedChange={(checked) => setEditingCourse({ ...editingCourse, isFree: checked })}
                  />
                  <Label htmlFor="isFree">Free Course</Label>
                </div>
                {!editingCourse?.isFree && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price">Price (€)</Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        value={editingCourse?.price || ""}
                        onChange={(e) => setEditingCourse({ ...editingCourse, price: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="originalPrice">Original Price (€)</Label>
                      <Input
                        id="originalPrice"
                        type="number"
                        step="0.01"
                        value={editingCourse?.originalPrice || ""}
                        onChange={(e) => setEditingCourse({ ...editingCourse, originalPrice: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="image">Course Image</Label>
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                  />
                  {editingCourse?.imageUrl && (
                    <img src={editingCourse.imageUrl} alt="Preview" className="mt-2 h-32 w-auto rounded" />
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isPublished"
                    checked={editingCourse?.isPublished !== false}
                    onCheckedChange={(checked) => setEditingCourse({ ...editingCourse, isPublished: checked })}
                  />
                  <Label htmlFor="isPublished">Published</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isTopPick"
                    checked={editingCourse?.isTopPick === true}
                    onCheckedChange={(checked) => setEditingCourse({ ...editingCourse, isTopPick: checked })}
                  />
                  <Label htmlFor="isTopPick">Top Pick ⭐</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCourseDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveCourse} disabled={uploading || !editingCourse?.title || !editingCourse?.description}>
                  {editingCourse?.id ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Bulk Actions */}
        {selectedCourses.length > 0 && (
          <Card className="bg-primary/5 border-primary">
            <CardContent className="flex items-center justify-between py-4">
              <p className="text-sm font-medium">{selectedCourses.length} course(s) selected</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedCourses([])}>Clear Selection</Button>
                <Button variant="destructive" size="sm" onClick={() => {
                  if (confirm(`Delete ${selectedCourses.length} selected course(s)?`)) {
                    selectedCourses.forEach(id => deleteMutation.mutate({ id }));
                    setSelectedCourses([]);
                  }
                }}>Delete Selected</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Select All Button */}
        {courses && courses.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selectedCourses.length === courses.length) {
                setSelectedCourses([]);
              } else {
                setSelectedCourses(courses.map((c: any) => c.id));
              }
            }}
          >
            {selectedCourses.length === courses.length ? 'Deselect All' : 'Select All'}
          </Button>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses && courses.length > 0 ? (
            courses.map((course: any) => (
              <Card key={course.id} className="relative">
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={selectedCourses.includes(course.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCourses([...selectedCourses, course.id]);
                      } else {
                        setSelectedCourses(selectedCourses.filter(id => id !== course.id));
                      }
                    }}
                    className="bg-white"
                  />
                </div>
                {course.imageUrl && (
                  <img src={course.imageUrl} alt={course.title} className="w-full h-48 object-cover rounded-t-lg" />
                )}
                <CardHeader>
                  <CardTitle>{course.title}</CardTitle>
                  <CardDescription>
                    {course.isFree ? "Free" : `€${course.price}`}
                    {!course.isPublished && " (Unpublished)"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">{course.description}</p>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => navigate(`/admin/courses/${course.id}/content`)}
                      className="flex-1"
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      Manage Content
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingCourse(course);
                        setCourseDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteCourse(course.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No courses yet. Create your first course!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
