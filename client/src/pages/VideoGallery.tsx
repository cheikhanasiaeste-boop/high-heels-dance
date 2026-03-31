import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Play, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

export default function VideoGallery() {
  const { user } = useAuth();
  const [selectedVideo, setSelectedVideo] = useState<any>(null);

  const { data: videoTestimonials, isLoading } = trpc.testimonials.videoTestimonials.useQuery();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d0010] via-[#110a18] to-[#0d0010]">
      <header className="bg-[#0d0010]/80 backdrop-blur-sm border-b border-white/10 sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              Video Testimonials
            </h1>
          </div>
          {user && (
            <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
          )}
        </div>
      </header>

      <div className="container py-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Student Success Stories</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Watch real students share their experiences and transformations through dance.
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : videoTestimonials && videoTestimonials.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videoTestimonials.map((testimonial) => (
                <Card
                  key={testimonial.id}
                  className="group cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedVideo(testimonial)}
                >
                  <CardContent className="p-0">
                    <div className="relative aspect-video bg-gradient-to-br from-pink-100 to-purple-100 rounded-t-lg overflow-hidden">
                      {testimonial.videoUrl ? (
                        <>
                          <video
                            src={testimonial.videoUrl}
                            className="w-full h-full object-cover"
                            preload="metadata"
                          />
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <div className="bg-white/90 rounded-full p-4 group-hover:scale-110 transition-transform">
                              <Play className="h-8 w-8 text-pink-600 fill-pink-600" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Play className="h-16 w-16 text-pink-300" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < testimonial.rating
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="font-semibold">{testimonial.userName}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {testimonial.review}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="max-w-md mx-auto">
              <CardContent className="py-12 text-center">
                <Play className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Video Testimonials Yet</h3>
                <p className="text-muted-foreground">
                  Be the first to share your dance journey with a video testimonial!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Video Player Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < (selectedVideo?.rating || 0)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
              <span>{selectedVideo?.userName}</span>
            </DialogTitle>
          </DialogHeader>
          {selectedVideo?.videoUrl && (
            <div className="space-y-4">
              <video
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                className="w-full rounded-lg"
              />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {selectedVideo.type === 'course' ? 'Course Review' : 'Session Review'}
                </p>
                <p className="text-base">{selectedVideo.review}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
