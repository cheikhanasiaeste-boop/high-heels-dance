import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BookOpen, Lock } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

export default function Courses() {
  const { isAuthenticated } = useAuth();
  const { data: courses, isLoading } = trpc.courses.list.useQuery();
  const [filter, setFilter] = useState<'all' | 'free' | 'premium'>('all');

  const filteredCourses = courses?.filter(course => {
    if (filter === 'free') return course.isFree;
    if (filter === 'premium') return !course.isFree;
    return true;
  }) || [];

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
                {course.imageUrl && (
                  <div className="relative h-48 overflow-hidden rounded-t-lg">
                    <img
                      src={course.imageUrl}
                      alt={course.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      style={{
                        transform: `scale(${parseFloat(course.imageCropZoom || "1.00")}) translate(${parseFloat(course.imageCropOffsetX || "0.00") / parseFloat(course.imageCropZoom || "1.00")}%, ${parseFloat(course.imageCropOffsetY || "0.00") / parseFloat(course.imageCropZoom || "1.00")}%)`,
                      }}
                    />
                    {!course.isFree && (
                      <Badge className="absolute top-3 right-3 bg-purple-600">
                        ✨ Premium
                      </Badge>
                    )}
                    {course.isFree && (
                      <Badge className="absolute top-3 right-3 bg-green-600">
                        🎁 Free
                      </Badge>
                    )}
                  </div>
                )}
                
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
    </div>
  );
}
