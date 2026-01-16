import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";

export function SectionHeadingsEditor() {
  const utils = trpc.useUtils();
  const { data: headings = [] } = trpc.admin.sectionHeadings.list.useQuery();

  const [newSection, setNewSection] = useState('');
  const [newHeading, setNewHeading] = useState('');
  const [newSubheading, setNewSubheading] = useState('');

  const createMutation = trpc.admin.sectionHeadings.create.useMutation({
    onSuccess: () => {
      toast.success("Section heading created!");
      utils.admin.sectionHeadings.list.invalidate();
      setNewSection('');
      setNewHeading('');
      setNewSubheading('');
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create section heading");
    },
  });

  const updateMutation = trpc.admin.sectionHeadings.update.useMutation({
    onSuccess: () => {
      toast.success("Section heading updated!");
      utils.admin.sectionHeadings.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update section heading");
    },
  });

  const deleteMutation = trpc.admin.sectionHeadings.delete.useMutation({
    onSuccess: () => {
      toast.success("Section heading deleted!");
      utils.admin.sectionHeadings.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete section heading");
    },
  });

  const handleCreate = () => {
    if (!newSection || !newHeading) {
      toast.error("Section ID and heading are required");
      return;
    }

    createMutation.mutate({
      section: newSection,
      heading: newHeading,
      subheading: newSubheading || undefined,
      displayOrder: headings.length,
      isVisible: true,
    });
  };

  const handleUpdate = (section: string, updates: any) => {
    updateMutation.mutate({
      section,
      ...updates,
    });
  };

  const handleDelete = (section: string) => {
    if (confirm(`Delete section heading "${section}"?`)) {
      deleteMutation.mutate({ section });
    }
  };

  return (
    <div className="space-y-6">
      {/* Add New Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Section Heading
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="new-section">Section ID</Label>
            <Input
              id="new-section"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="e.g., courses, testimonials, about"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Unique identifier for this section (lowercase, no spaces)
            </p>
          </div>

          <div>
            <Label htmlFor="new-heading">Heading</Label>
            <Input
              id="new-heading"
              value={newHeading}
              onChange={(e) => setNewHeading(e.target.value)}
              placeholder="e.g., Our Courses"
            />
          </div>

          <div>
            <Label htmlFor="new-subheading">Subheading (Optional)</Label>
            <Textarea
              id="new-subheading"
              value={newSubheading}
              onChange={(e) => setNewSubheading(e.target.value)}
              placeholder="e.g., Discover our range of dance classes"
              rows={2}
            />
          </div>

          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            {createMutation.isPending ? "Creating..." : "Create Section Heading"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Sections */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Existing Section Headings</h3>
        {headings.length === 0 ? (
          <p className="text-muted-foreground">No section headings yet. Create one above!</p>
        ) : (
          headings.map((heading) => (
            <SectionHeadingItem
              key={heading.section}
              heading={heading}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              isUpdating={updateMutation.isPending}
              isDeleting={deleteMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SectionHeadingItem({
  heading,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
}: {
  heading: any;
  onUpdate: (section: string, updates: any) => void;
  onDelete: (section: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editHeading, setEditHeading] = useState(heading.heading);
  const [editSubheading, setEditSubheading] = useState(heading.subheading || '');
  const [isVisible, setIsVisible] = useState(heading.isVisible);

  const handleSave = () => {
    onUpdate(heading.section, {
      heading: editHeading,
      subheading: editSubheading || undefined,
      isVisible,
    });
    setIsEditing(false);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <code className="text-sm bg-muted px-2 py-1 rounded">{heading.section}</code>
              <Switch
                checked={isVisible}
                onCheckedChange={(checked) => {
                  setIsVisible(checked);
                  onUpdate(heading.section, { isVisible: checked });
                }}
              />
              <span className="text-sm text-muted-foreground">
                {isVisible ? 'Visible' : 'Hidden'}
              </span>
            </div>

            {isEditing ? (
              <>
                <div>
                  <Label>Heading</Label>
                  <Input
                    value={editHeading}
                    onChange={(e) => setEditHeading(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Subheading</Label>
                  <Textarea
                    value={editSubheading}
                    onChange={(e) => setEditSubheading(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} size="sm" disabled={isUpdating}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button onClick={() => setIsEditing(false)} size="sm" variant="outline">
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h4 className="font-semibold">{heading.heading}</h4>
                  {heading.subheading && (
                    <p className="text-sm text-muted-foreground mt-1">{heading.subheading}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setIsEditing(true)} size="sm" variant="outline">
                    Edit
                  </Button>
                  <Button
                    onClick={() => onDelete(heading.section)}
                    size="sm"
                    variant="destructive"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
