import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Instagram, Youtube, Facebook, MessageCircle, Star, Play } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import ChatWidget from "@/components/ChatWidget";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { data: courses, isLoading } = trpc.courses.list.useQuery();
  const { data: banner } = trpc.banner.get.useQuery();
  const { data: textTestimonials } = trpc.testimonials.list.useQuery();
  const { data: videoTestimonials } = trpc.testimonials.videoTestimonials.useQuery();
  
  // Fetch editable content
  const { data: heroTitle } = trpc.admin.content.get.useQuery({ key: 'hero_title' });
  const { data: heroTagline } = trpc.admin.content.get.useQuery({ key: 'hero_tagline' });
  const { data: coursesHeading } = trpc.admin.content.get.useQuery({ key: 'courses_heading' });
  const { data: testimonialsHeading } = trpc.admin.content.get.useQuery({ key: 'testimonials_heading' });
  const { data: heroVideoUrl } = trpc.admin.settings.get.useQuery(
    { key: "heroVideoUrl" },
    { enabled: true }
  );
  const [showChat, setShowChat] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [courseFilter, setCourseFilter] = useState<'all' | 'free' | 'premium'>('all');

  // Filter courses based on selected filter
  const filteredCourses = courses?.filter(course => {
    if (courseFilter === 'free') return course.isFree;
    if (courseFilter === 'premium') return !course.isFree;
    return true;
  }) || [];

  // Combine text and video testimonials
  const allTestimonials = [
    ...(textTestimonials || []).map(t => ({ ...t, type: 'text' as const })),
    ...(videoTestimonials || []).map(t => ({ ...t, type: 'video' as const }))
  ].sort((a, b) => {
    // Featured first, then by creation date
    if (a.isFeatured && !b.isFeatured) return -1;
    if (!a.isFeatured && b.isFeatured) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="min-h-screen">
      {/* Discount Banner */}
      {banner?.enabled && banner.text && (
        <div className="bg-primary text-primary-foreground py-3 px-4 text-center font-medium">
          {banner.text}
        </div>
      )}

      {/* Header/Navigation */}
      <header className="border-b bg-card sticky top-0 z-50 backdrop-blur-sm bg-white/95">
        <div className="container py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">High Heels Dance</h1>
          <div className="flex items-center gap-4">
            <Link href="/book-session">
              <Button variant="default">Book a Session</Button>
            </Link>
            {isAuthenticated ? (
              <>
                <Link href="/my-courses">
                  <Button variant="ghost">My Courses</Button>
                </Link>
                {user?.role === 'admin' && (
                  <Link href="/admin">
                    <Button variant="outline">Admin</Button>
                  </Link>
                )}
                <span className="text-sm text-muted-foreground hidden md:inline">{user?.name || user?.email}</span>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button>Sign In</Button>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Hero/Profile Section */}
      <section className="relative py-20 overflow-hidden">
        {/* Video Background */}
        {heroVideoUrl ? (
          <>
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            >
              <source src={heroVideoUrl} type="video/mp4" />
            </video>
            {/* Overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-br from-pink-900/70 via-purple-900/60 to-pink-900/70 backdrop-blur-[2px]"></div>
          </>
        ) : (
          // Fallback gradient background
          <div className="absolute inset-0 bg-gradient-to-br from-pink-50 via-lavender-50 to-purple-50"></div>
        )}
        
        <div className="container text-center relative z-10">
          <div className="flex justify-center mb-6">
            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-pink-300 to-purple-300 flex items-center justify-center text-5xl font-bold text-white shadow-xl">
              EZ
            </div>
          </div>
          <h2 className={`text-5xl font-bold mb-4 ${
            heroVideoUrl 
              ? 'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]' 
              : 'bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent'
          }`}>
            {heroTitle || 'Elizabeth Zolotova'}
          </h2>
          <p className={`text-xl mb-8 max-w-2xl mx-auto leading-relaxed font-serif ${
            heroVideoUrl
              ? 'text-white/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
              : 'text-muted-foreground'
          }`}>
            {heroTagline || "I'm a professional dancer and dance teacher who can make you fall in love with dance."}
          </p>
          <div className="flex justify-center gap-4 mb-8">
            <Button variant="outline" size="icon" className="rounded-full hover:bg-pink-100 transition-colors">
              <Instagram className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full hover:bg-pink-100 transition-colors">
              <Youtube className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full hover:bg-pink-100 transition-colors">
              <Facebook className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex justify-center gap-4">
            <Link href="/book-session">
              <Button size="lg" className="shadow-lg">Book a Dance Session</Button>
            </Link>
            {!isAuthenticated && (
              <a href={getLoginUrl()}>
                <Button size="lg" variant="outline">Explore Courses</Button>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Courses Section - PROMINENT */}
      <section className="py-20 bg-gradient-to-b from-white via-pink-50/30 to-white relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-10 w-72 h-72 bg-pink-400 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400 rounded-full blur-3xl"></div>
        </div>
        <div className="container relative z-10">
          <div className="text-center mb-16">
            <h3 className="text-5xl font-bold mb-4 bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {coursesHeading || 'Dance Courses'}
            </h3>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Transform your dance skills with professionally designed courses for all levels
            </p>
            
            {/* Enhanced Course Filter */}
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-md p-2 rounded-full shadow-lg border border-pink-100">
              <button
                onClick={() => setCourseFilter('all')}
                className={`px-6 py-3 rounded-full font-medium transition-all duration-300 flex items-center gap-2 ${
                  courseFilter === 'all'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md scale-105'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="text-lg">🎯</span>
                All Courses
                {courseFilter === 'all' && courses && (
                  <span className="ml-1 px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold">
                    {courses.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setCourseFilter('free')}
                className={`px-6 py-3 rounded-full font-medium transition-all duration-300 flex items-center gap-2 ${
                  courseFilter === 'free'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-md scale-105'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="text-lg">🎁</span>
                Free
                {courseFilter === 'free' && (
                  <span className="ml-1 px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold">
                    {filteredCourses.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setCourseFilter('premium')}
                className={`px-6 py-3 rounded-full font-medium transition-all duration-300 flex items-center gap-2 ${
                  courseFilter === 'premium'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md scale-105'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="text-lg">✨</span>
                Premium
                {courseFilter === 'premium' && (
                  <span className="ml-1 px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold">
                    {filteredCourses.length}
                  </span>
                )}
              </button>
            </div>
          </div>
          
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <div className="h-56 bg-muted"></div>
                  <CardHeader>
                    <div className="h-6 bg-muted rounded mb-2"></div>
                    <div className="h-4 bg-muted rounded"></div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 max-w-7xl mx-auto">
              {filteredCourses.map((course) => (
                <Card 
                  key={course.id} 
                  className="group overflow-hidden hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border-0 bg-white/90 backdrop-blur-sm"
                >
                  <div className="aspect-[16/10] bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center relative overflow-hidden">
                    {course.imageUrl ? (
                      <>
                        <img 
                          src={course.imageUrl} 
                          alt={course.title} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        {!course.isFree && (
                          <div className="absolute top-4 right-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-1 animate-pulse">
                            <span>✨</span> PREMIUM
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-8xl group-hover:scale-110 transition-transform duration-500">💃</span>
                        {!course.isFree && (
                          <div className="absolute top-4 right-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-1">
                            <span>✨</span> PREMIUM
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-3">
                      <CardTitle className="text-2xl font-bold group-hover:text-pink-600 transition-colors">
                        {course.title}
                      </CardTitle>
                      {course.isFree && (
                        <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-md">Free</Badge>
                      )}
                    </div>
                    <CardDescription className="line-clamp-2 text-base leading-relaxed">{course.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="flex items-baseline gap-3">
                      {course.isFree ? (
                        <span className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                          Free
                        </span>
                      ) : (
                        <>
                          <span className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                            €{course.price}
                          </span>
                          {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                            <span className="text-xl text-muted-foreground line-through">
                              €{course.originalPrice}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Link href={`/course/${course.id}`} className="w-full">
                      <Button className="w-full text-lg py-6 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                        {course.isFree ? '🎯 Start Learning' : '👀 View Details'}
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                {courseFilter === 'all' 
                  ? 'No courses available at the moment. Check back soon!' 
                  : `No ${courseFilter} courses available at the moment.`}
              </p>
              {courseFilter !== 'all' && (
                <Button
                  variant="outline"
                  onClick={() => setCourseFilter('all')}
                  className="mt-4"
                >
                  View All Courses
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Testimonials Section - Mixed Text & Video */}
      {allTestimonials.length > 0 && (
        <section className="py-20 bg-gradient-to-br from-purple-50 via-pink-50 to-lavender-50">
          <div className="container">
            <div className="text-center mb-12">
              <h3 className="text-4xl font-bold mb-4">{testimonialsHeading || 'Student Success Stories'}</h3>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Hear from our amazing students about their dance journey
              </p>
            </div>
            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              plugins={[
                Autoplay({
                  delay: 6000,
                }),
              ]}
              className="w-full max-w-6xl mx-auto"
            >
              <CarouselContent>
                {allTestimonials.map((testimonial) => (
                  <CarouselItem key={testimonial.id} className="md:basis-1/2 lg:basis-1/3">
                    {testimonial.type === 'video' && testimonial.videoUrl ? (
                      <Card 
                        className="h-full cursor-pointer hover:shadow-xl transition-shadow group"
                        onClick={() => setSelectedVideo(testimonial)}
                      >
                        <div className="relative aspect-video bg-gradient-to-br from-pink-100 to-purple-100 overflow-hidden">
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
                        </div>
                        <CardHeader>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center font-bold text-primary">
                                {testimonial.userName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <CardTitle className="text-base">{testimonial.userName}</CardTitle>
                                <div className="flex gap-0.5 mt-1">
                                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                                    <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700">Video</Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground line-clamp-2 italic">"{testimonial.review}"</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="h-full hover:shadow-xl transition-shadow">
                        <CardHeader>
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center font-bold text-primary text-lg">
                              {testimonial.userName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <CardTitle className="text-base">{testimonial.userName}</CardTitle>
                              <div className="flex gap-0.5 mt-1">
                                {Array.from({ length: testimonial.rating }).map((_, i) => (
                                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground italic leading-relaxed">"{testimonial.review}"</p>
                        </CardContent>
                      </Card>
                    )}
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="hidden md:flex" />
              <CarouselNext className="hidden md:flex" />
            </Carousel>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t py-8 bg-card">
        <div className="container text-center text-muted-foreground">
          <p>&copy; 2026 High Heels Dance - Elizabeth Zolotova. All rights reserved.</p>
        </div>
      </footer>

      {/* Floating Chat Button */}
      <Button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-shadow"
        size="icon"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* AI Chat Box */}
      {showChat && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] z-50">
          <ChatWidget onClose={() => setShowChat(false)} />
        </div>
      )}

      {/* Video Player Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
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
                <p className="text-base italic">"{selectedVideo.review}"</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
