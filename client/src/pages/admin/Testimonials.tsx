import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Check, X, Star, Image as ImageIcon, Video, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function AdminTestimonials() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [selectedTestimonials, setSelectedTestimonials] = useState<number[]>([]);
  
  const { data: testimonials, isLoading } = trpc.admin.testimonials.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const approveMutation = trpc.admin.testimonials.approve.useMutation({
    onSuccess: () => {
      toast.success("Testimonial approved");
      utils.admin.testimonials.list.invalidate();
      utils.testimonials.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to approve testimonial");
    },
  });

  const rejectMutation = trpc.admin.testimonials.reject.useMutation({
    onSuccess: () => {
      toast.success("Testimonial rejected");
      utils.admin.testimonials.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reject testimonial");
    },
  });

  const toggleFeaturedMutation = trpc.admin.testimonials.toggleFeatured.useMutation({
    onSuccess: () => {
      toast.success("Featured status updated!");
      utils.admin.testimonials.list.invalidate();
      utils.testimonials.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update featured status");
    },
  });

  const deleteMutation = trpc.admin.testimonials.delete.useMutation({
    onSuccess: () => {
      toast.success("Testimonial deleted");
      utils.admin.testimonials.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete testimonial");
    },
  });

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
        <div>
          <h1 className="text-3xl font-bold">Testimonials</h1>
          <p className="text-muted-foreground mt-2">Review and manage user testimonials</p>
        </div>

        {/* Bulk Actions */}
        {selectedTestimonials.length > 0 && (
          <Card className="bg-primary/5 border-primary">
            <CardContent className="flex items-center justify-between py-4">
              <p className="text-sm font-medium">{selectedTestimonials.length} testimonial(s) selected</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedTestimonials([])}>Clear Selection</Button>
                <Button variant="default" size="sm" onClick={() => {
                  if (confirm(`Approve ${selectedTestimonials.length} selected testimonial(s)?`)) {
                    selectedTestimonials.forEach(id => approveMutation.mutate({ id }));
                    setSelectedTestimonials([]);
                  }
                }}>Approve Selected</Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  if (confirm(`Reject ${selectedTestimonials.length} selected testimonial(s)?`)) {
                    selectedTestimonials.forEach(id => rejectMutation.mutate({ id }));
                    setSelectedTestimonials([]);
                  }
                }}>Reject Selected</Button>
                <Button variant="destructive" size="sm" onClick={() => {
                  if (confirm(`Delete ${selectedTestimonials.length} selected testimonial(s)?`)) {
                    selectedTestimonials.forEach(id => deleteMutation.mutate({ id }));
                    setSelectedTestimonials([]);
                  }
                }}>Delete Selected</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Select All Button */}
        {testimonials && testimonials.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selectedTestimonials.length === testimonials.length) {
                setSelectedTestimonials([]);
              } else {
                setSelectedTestimonials(testimonials.map((t: any) => t.id));
              }
            }}
          >
            {selectedTestimonials.length === testimonials.length ? 'Deselect All' : 'Select All'}
          </Button>
        )}

        <div className="space-y-4">
          {testimonials && testimonials.length > 0 ? (
            testimonials.map((testimonial: any) => (
              <Card key={testimonial.id} className={cn(
                testimonial.status === 'pending' ? 'border-2 border-yellow-500 shadow-lg shadow-yellow-500/20' : '',
                'transition-all'
              )}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <Checkbox
                      checked={selectedTestimonials.includes(testimonial.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTestimonials([...selectedTestimonials, testimonial.id]);
                        } else {
                          setSelectedTestimonials(selectedTestimonials.filter(id => id !== testimonial.id));
                        }
                      }}
                    />
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {testimonial.userName}
                        {testimonial.type === 'course' && testimonial.relatedId && (
                          <span className="text-sm font-normal text-muted-foreground">
                            • Course Feedback
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        {new Date(testimonial.createdAt).toLocaleDateString()}
                        {/* Star Rating */}
                        <span className="flex items-center gap-1 ml-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${
                                i < testimonial.rating
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                          <span className="text-xs ml-1">({testimonial.rating}/5)</span>
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {testimonial.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveMutation.mutate({ id: testimonial.id })}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rejectMutation.mutate({ id: testimonial.id })}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                        </>
                      )}
                      {testimonial.status === 'approved' && (
                        <Button
                          size="sm"
                          variant={testimonial.isFeatured ? "default" : "outline"}
                          onClick={() => toggleFeaturedMutation.mutate({ id: testimonial.id, isFeatured: !testimonial.isFeatured })}
                        >
                          <Star className="h-4 w-4 mr-2" />
                          {testimonial.isFeatured ? 'Featured' : 'Feature'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm("Delete this testimonial?")) {
                            deleteMutation.mutate({ id: testimonial.id });
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{testimonial.review}</p>
                  
                  {/* Media Display */}
                  {(testimonial.photoUrl || testimonial.videoUrl) && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Attached Media:</p>
                      <div className="flex gap-2">
                        {testimonial.photoUrl && (
                          <a
                            href={testimonial.photoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-accent transition-colors"
                          >
                            <ImageIcon className="w-4 h-4" />
                            <span className="text-sm">View Photo</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {testimonial.videoUrl && (
                          <a
                            href={testimonial.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-accent transition-colors"
                          >
                            <Video className="w-4 h-4" />
                            <span className="text-sm">View Video</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-1 rounded ${
                      testimonial.status === 'approved' ? 'bg-green-100 text-green-800' :
                      testimonial.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {testimonial.status}
                    </span>
                    {testimonial.isFeatured && (
                      <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                        Featured
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No testimonials yet</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
