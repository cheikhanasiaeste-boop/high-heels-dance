import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BookOpen, Lock } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useProgressiveAuth } from '@/hooks/useProgressiveAuth';
import { ProgressiveAuthModal } from '@/components/ProgressiveAuthModal';

export default function Courses() {
  const { isAuthenticated } = useAuth();
  const { isAuthModalOpen, authContext, authContextDetails, requireAuth, closeAuthModal } = useProgressiveAuth();
  const { data: courses, isLoading } = trpc.courses.list.useQuery();
  const [filter, setFilter] = useState<'all' | 'free' | 'premium'>('all');

  const filteredCourses = (courses?.filter(course => {
    if (filter === 'free') return course.isFree;
    if (filter === 'premium') return !course.isFree;
    return true;
  }) || []).sort((a, b) => {
    // Top picks come first
    if (a.isTopPick && !b.isTopPick) return -1;
    if (!a.isTopPick && b.isTopPick) return 1;
    // Within same category, sort by ID descending (newest first)
    return b.id - a.id;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-bold mb-2">Dance Courses</h1>
          <p className="text-muted-foreground">
            Transform your dance skills with professionally designed courses for all levels
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        {/* Filter Buttons */}
        <div className="flex gap-2 mb-8 flex-wrap">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            className="gap-2"
          >
            ✧ All Courses
            <Badge variant="secondary" className="ml-1">
              {courses?.length || 0}
            </Badge>
          </Button>
          <Button
            variant={filter === 'free' ? 'default' : 'outline'}
            onClick={() => setFilter('free')}
            className="gap-2"
          >
            🎁 Free
          </Button>
          <Button
            variant={filter === 'premium' ? 'default' : 'outline'}
            onClick={() => setFilter('premium')}
            className="gap-2"
          >
            ✨ Premium
          </Button>
        </div>

        {/* Courses Grid */}
        {filteredCourses.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">
                {filter === 'all' 
                  ? 'No courses available yet'
                  : `No ${filter} courses available`
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => (
              <Card key={course.id} className="flex flex-col hover:shadow-lg transition-shadow">
                <div className="relative">
                  {course.imageUrl ? (
                    <>
                      <img 
                        src={course.imageUrl} 
                        alt={course.title} 
                        className="w-full h-48 object-cover rounded-t-lg"
                      />
                      {course.isTopPick && (
                        <div className="absolute top-4 left-4 z-10">
                          <div className="relative animate-pulse-glow">
                            {/* Outer glow - gold shimmer */}
                            <div className="absolute -inset-3 bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-400 rounded-full blur-lg opacity-60 animate-spin-slow"></div>
                            {/* Middle glow - pink/purple */}
                            <div className="absolute -inset-2 bg-gradient-to-r from-pink-400 via-fuchsia-400 to-purple-400 rounded-full blur-md opacity-75"></div>
                            {/* Inner sparkle */}
                            <div className="absolute -inset-1 bg-gradient-to-r from-pink-300 via-purple-300 to-pink-300 rounded-full blur-sm opacity-50 animate-sparkle"></div>
                            {/* Badge */}
                            <div className="relative bg-gradient-to-r from-amber-500 via-pink-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-extrabold shadow-2xl flex items-center gap-2 border-2 border-yellow-300/80">
                              <span className="text-lg animate-star-bounce">⭐</span>
                              <span className="tracking-wider">TOP PICK</span>
                              <div className="absolute inset-0 rounded-full animate-shimmer-gold pointer-events-none"></div>
                            </div>
                          </div>
                        </div>
                      )}
                      {!course.isFree && (
                        <div className="absolute top-4 right-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-1 animate-pulse">
                          <span>✨</span> PREMIUM
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-pink-100 to-purple-100 rounded-t-lg flex items-center justify-center">
                      <span className="text-6xl">💃</span>
                    </div>
                  )}
                </div>
                
                <CardHeader>
                  <CardTitle className="line-clamp-2">{course.title}</CardTitle>
                  <CardDescription className="line-clamp-3">
                    {course.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex-grow">
                  <div className="flex items-center justify-between">
                    <div>
                      {course.isFree ? (
                        <span className="text-2xl font-bold text-green-600">Free</span>
                      ) : (
                        <div className="flex items-baseline gap-2">
                          {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                            <span className="text-lg text-muted-foreground line-through">
                              €{Number(course.originalPrice).toFixed(2)}
                            </span>
                          )}
                          <span className="text-2xl font-bold">
                            €{Number(course.price).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="flex gap-2">
                  <Link href={`/course/${course.id}`} className="flex-1">
                    <Button variant="outline" className="w-full">
                      ◇ View Details
                    </Button>
                  </Link>
                  <Link href={`/course/${course.id}`} className="flex-1">
                    <Button className="w-full">
                      {course.isFree ? '✧ Start Learning' : '✧ Enroll Now'}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Progressive Authentication Modal */}
      <ProgressiveAuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        context={authContext || 'course'}
        contextDetails={authContextDetails}
      />
    </div>
  );
}
