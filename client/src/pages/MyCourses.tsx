import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link } from "wouter";

export default function MyCourses() {
  const { user, isAuthenticated, loading } = useAuth();
  const { data: purchases, isLoading: purchasesLoading } = trpc.purchases.myPurchases.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: allCourses } = trpc.courses.list.useQuery();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/";
    return null;
  }

  // Get purchased course IDs
  const purchasedCourseIds = new Set(
    purchases?.filter(p => p.status === 'completed').map(p => p.courseId) || []
  );

  // Get free courses
  const freeCourses = allCourses?.filter(c => c.isFree) || [];

  // Get purchased courses
  const purchasedCourses = allCourses?.filter(c => purchasedCourseIds.has(c.id)) || [];

  // Combine all accessible courses
  const myCourses = [...freeCourses, ...purchasedCourses];

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="container py-4 flex justify-between items-center">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <span className="text-sm text-muted-foreground">{user?.name || user?.email}</span>
        </div>
      </header>

      <div className="container py-16">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">My Courses</h1>
          <p className="text-muted-foreground">
            Access all your enrolled courses in one place
          </p>
        </div>

        {purchasesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-48 bg-muted"></div>
                <CardHeader>
                  <div className="h-6 bg-muted rounded mb-2"></div>
                  <div className="h-4 bg-muted rounded"></div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : myCourses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myCourses.map((course) => (
              <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                <div className="h-48 bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center overflow-hidden">
                  {course.imageUrl ? (
                    <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-6xl">💃</span>
                  )}
                </div>
                <CardHeader className="flex-grow">
                  <CardTitle className="text-xl">{course.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{course.description}</CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto">
                  <Link href={`/course/${course.id}`} className="w-full">
                    <Button className="w-full">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Continue Learning
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-16">
            <CardContent>
              <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Courses Yet</h3>
              <p className="text-muted-foreground mb-6">
                You haven't enrolled in any courses yet. Browse our catalog to get started!
              </p>
              <Link href="/">
                <Button>Browse Courses</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
