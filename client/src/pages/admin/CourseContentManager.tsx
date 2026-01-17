import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { VideoUpload } from "@/components/VideoUpload";
import {
  GraduationCap,
  ShoppingCart,
  Settings,
  Image as ImageIcon,
  Plus,
  Trash2,
  GripVertical,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
} from "lucide-react";

type Tab = "thumbnail" | "checkout" | "course" | "options";

export default function CourseContentManager() {
  const params = useParams();
  const courseId = parseInt(params.id || "0");
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("course");
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);

  // Fetch course data
  const { data: courses } = trpc.admin.courses.list.useQuery();
  const course = courses?.find((c) => c.id === courseId);

  // Fetch modules and lessons
  const { data: modules = [], refetch: refetchModules } =
    trpc.admin.courseContent.getModules.useQuery({ courseId });
  const { data: lessons = [], refetch: refetchLessons } =
    trpc.admin.courseContent.getLessons.useQuery(
      { moduleId: selectedModuleId! },
      { enabled: !!selectedModuleId }
    );

  // Mutations
  const createModuleMutation = trpc.admin.courseContent.createModule.useMutation({
    onSuccess: () => {
      refetchModules();
      toast.success("Module created successfully");
    },
  });

  const deleteModuleMutation = trpc.admin.courseContent.deleteModule.useMutation({
    onSuccess: () => {
      refetchModules();
      setSelectedModuleId(null);
      toast.success("Module deleted successfully");
    },
  });

  const createLessonMutation = trpc.admin.courseContent.createLesson.useMutation({
    onSuccess: () => {
      refetchLessons();
      toast.success("Lesson created successfully");
    },
  });

  const deleteLessonMutation = trpc.admin.courseContent.deleteLesson.useMutation({
    onSuccess: () => {
      refetchLessons();
      toast.success("Lesson deleted successfully");
    },
  });

  if (!course) {
    return (
      <div className="container py-8">
        <p>Course not found</p>
      </div>
    );
  }

  const tabs = [
    { id: "thumbnail" as Tab, label: "Thumbnail", icon: ImageIcon },
    { id: "checkout" as Tab, label: "Checkout Page", icon: ShoppingCart },
    { id: "course" as Tab, label: "Course", icon: GraduationCap },
    { id: "options" as Tab, label: "Options", icon: Settings },
  ];

  return (
    <div className="container max-w-6xl py-8">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/courses")}
          className="mb-4"
        >
          ← Back to Courses
        </Button>
        <h1 className="text-3xl font-bold">{course.title}</h1>
        <p className="text-muted-foreground mt-2">Manage course content and structure</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === "thumbnail" && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Course Thumbnail</h2>
            <p className="text-muted-foreground">Thumbnail management coming soon...</p>
          </div>
        )}

        {activeTab === "checkout" && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Checkout Page</h2>
            <p className="text-muted-foreground">Checkout page customization coming soon...</p>
          </div>
        )}

        {activeTab === "course" && (
          <div className="space-y-6">
            {/* Course Homepage Section */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                      1
                    </span>
                    <h2 className="text-xl font-semibold">Course Homepage</h2>
                  </div>
                  <p className="text-sm text-muted-foreground ml-10">
                    Start by giving your course a name and setting up your home page.
                  </p>
                </div>
              </div>

              <div className="ml-10 mt-6 space-y-4">
                <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg">
                  <div className="w-24 h-16 bg-muted rounded flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Homepage</p>
                    <p className="font-medium">{course.title}</p>
                  </div>
                  <Button variant="outline">Edit Page →</Button>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium mb-2">Preview Video</h3>
                  <p className="text-xs text-muted-foreground mb-3">Upload a preview video to showcase your course</p>
                  <CoursePreviewVideo courseId={courseId} currentVideoUrl={course.previewVideoUrl} />
                </div>
              </div>
            </Card>

            {/* Add Modules Section */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                  2
                </span>
                <h2 className="text-xl font-semibold">Add modules</h2>
              </div>

              <div className="space-y-4">
                {modules.map((module) => (
                  <ModuleCard
                    key={module.id}
                    module={module}
                    isSelected={selectedModuleId === module.id}
                    onSelect={() => setSelectedModuleId(module.id)}
                    onDelete={() => deleteModuleMutation.mutate({ id: module.id })}
                    lessons={selectedModuleId === module.id ? lessons : []}
                    onAddLesson={(title) => {
                      createLessonMutation.mutate({
                        moduleId: module.id,
                        courseId,
                        title,
                        order: lessons.length,
                      });
                    }}
                    onDeleteLesson={(lessonId) => {
                      deleteLessonMutation.mutate({ id: lessonId });
                    }}
                  />
                ))}

                {/* Add Module Button */}
                <AddModuleDialog
                  onAdd={(title, description) => {
                    createModuleMutation.mutate({
                      courseId,
                      title,
                      description,
                      order: modules.length,
                    });
                  }}
                />
              </div>
            </Card>
          </div>
        )}

        {activeTab === "options" && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Course Options</h2>
            <p className="text-muted-foreground">Course settings coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Module Card Component
function ModuleCard({
  module,
  isSelected,
  onSelect,
  onDelete,
  lessons,
  onAddLesson,
  onDeleteLesson,
}: {
  module: any;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  lessons: any[];
  onAddLesson: (title: string) => void;
  onDeleteLesson: (lessonId: number) => void;
}) {
  return (
    <Card className="border-2">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <GripVertical className="w-5 h-5 text-muted-foreground cursor-move" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{module.title}</h3>
              {module.isPublished ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Eye className="w-3 h-3" />
                  Published
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <EyeOff className="w-3 h-3" />
                  Draft
                </span>
              )}
            </div>
            {module.description && (
              <p className="text-sm text-muted-foreground mt-1">{module.description}</p>
            )}
          </div>
          <EditModuleDialog module={module} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onSelect}
            className={isSelected ? "rotate-90" : ""}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Lessons */}
        {isSelected && (
          <div className="mt-4 ml-8 space-y-2">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{lesson.title}</p>
                  {lesson.duration && (
                    <p className="text-xs text-muted-foreground">{lesson.duration}min</p>
                  )}
                </div>
                <EditLessonDialog lesson={lesson} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeleteLesson(lesson.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}

            {/* Add Lesson Button */}
            <AddLessonDialog onAdd={onAddLesson} />
          </div>
        )}
      </div>
    </Card>
  );
}

// Add Module Dialog
function AddModuleDialog({ onAdd }: { onAdd: (title: string, description?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleAdd = () => {
    if (!title.trim()) {
      toast.error("Module title is required");
      return;
    }
    onAdd(title, description);
    setTitle("");
    setDescription("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full border-dashed">
          <Plus className="w-4 h-4 mr-2" />
          Add Module
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Module</DialogTitle>
          <DialogDescription>Create a new module to organize your lessons.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="module-title">Module Title</Label>
            <Input
              id="module-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Warm-Up"
            />
          </div>
          <div>
            <Label htmlFor="module-description">Description (Optional)</Label>
            <Textarea
              id="module-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this module"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>Add Module</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Add Lesson Dialog
function AddLessonDialog({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const handleAdd = () => {
    if (!title.trim()) {
      toast.error("Lesson title is required");
      return;
    }
    onAdd(title);
    setTitle("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full border-dashed">
          <Plus className="w-3 h-3 mr-2" />
          Add Lesson
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Lesson</DialogTitle>
          <DialogDescription>Create a new lesson in this module.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="lesson-title">Lesson Title</Label>
            <Input
              id="lesson-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Warm-Up (8min)"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>Add Lesson</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Course Preview Video Component
function CoursePreviewVideo({ courseId, currentVideoUrl }: { courseId: number; currentVideoUrl?: string | null }) {
  const utils = trpc.useUtils();
  const uploadMutation = trpc.media.uploadCourseVideo.useMutation({
    onSuccess: () => {
      utils.admin.courses.list.invalidate();
    },
  });

  const handleUpload = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result?.toString().split(',')[1];
          if (!base64) throw new Error("Failed to read file");
          
          await uploadMutation.mutateAsync({
            courseId,
            filename: file.name,
            contentType: file.type,
            data: base64,
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  return <VideoUpload onUpload={handleUpload} currentVideoUrl={currentVideoUrl} />;
}

// Edit Module Dialog
function EditModuleDialog({ module }: { module: any }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description || "");
  const utils = trpc.useUtils();
  
  const updateMutation = trpc.admin.courseContent.updateModule.useMutation({
    onSuccess: () => {
      utils.admin.courseContent.getModules.invalidate();
      toast.success("Module updated successfully");
      setOpen(false);
    },
  });

  const uploadMutation = trpc.media.uploadModuleVideo.useMutation({
    onSuccess: () => {
      utils.admin.courseContent.getModules.invalidate();
    },
  });

  const handleUpload = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result?.toString().split(',')[1];
          if (!base64) throw new Error("Failed to read file");
          
          await uploadMutation.mutateAsync({
            moduleId: module.id,
            filename: file.name,
            contentType: file.type,
            data: base64,
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Module title is required");
      return;
    }
    updateMutation.mutate({
      id: module.id,
      title,
      description,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Module</DialogTitle>
          <DialogDescription>Update module details and upload video content.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-module-title">Module Title</Label>
            <Input
              id="edit-module-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Warm-Up"
            />
          </div>
          <div>
            <Label htmlFor="edit-module-description">Description</Label>
            <Textarea
              id="edit-module-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this module"
              rows={3}
            />
          </div>
          <div>
            <Label>Module Video</Label>
            <VideoUpload 
              onUpload={handleUpload} 
              currentVideoUrl={module.videoUrl} 
              label="Upload Module Video"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit Lesson Dialog
function EditLessonDialog({ lesson }: { lesson: any }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description || "");
  const [duration, setDuration] = useState(lesson.duration?.toString() || "");
  const utils = trpc.useUtils();
  
  const updateMutation = trpc.admin.courseContent.updateLesson.useMutation({
    onSuccess: () => {
      utils.admin.courseContent.getLessons.invalidate();
      toast.success("Lesson updated successfully");
      setOpen(false);
    },
  });

  const uploadMutation = trpc.media.uploadLessonVideo.useMutation({
    onSuccess: () => {
      utils.admin.courseContent.getLessons.invalidate();
    },
  });

  const handleUpload = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result?.toString().split(',')[1];
          if (!base64) throw new Error("Failed to read file");
          
          await uploadMutation.mutateAsync({
            lessonId: lesson.id,
            filename: file.name,
            contentType: file.type,
            data: base64,
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Lesson title is required");
      return;
    }
    updateMutation.mutate({
      id: lesson.id,
      title,
      description,
      duration: duration ? parseInt(duration) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lesson</DialogTitle>
          <DialogDescription>Update lesson details and upload video content.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-lesson-title">Lesson Title</Label>
            <Input
              id="edit-lesson-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Warm-Up (8min)"
            />
          </div>
          <div>
            <Label htmlFor="edit-lesson-description">Description</Label>
            <Textarea
              id="edit-lesson-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this lesson"
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="edit-lesson-duration">Duration (minutes)</Label>
            <Input
              id="edit-lesson-duration"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g., 8"
            />
          </div>
          <div>
            <Label>Lesson Video</Label>
            <VideoUpload 
              onUpload={handleUpload} 
              currentVideoUrl={lesson.videoUrl} 
              label="Upload Lesson Video"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
