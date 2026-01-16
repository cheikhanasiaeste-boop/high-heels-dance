import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Instagram, Youtube, Facebook, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import ChatWidget from "@/components/ChatWidget";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { data: courses, isLoading } = trpc.courses.list.useQuery();
  const { data: banner } = trpc.banner.get.useQuery();
  const [showChat, setShowChat] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Discount Banner */}
      {banner?.enabled && banner.text && (
        <div className="bg-primary text-primary-foreground py-3 px-4 text-center font-medium">
          {banner.text}
        </div>
      )}

      {/* Header/Navigation */}
      <header className="border-b bg-card">
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
                <span className="text-sm text-muted-foreground">{user?.name || user?.email}</span>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button>Sign In</Button>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Profile Section */}
      <section className="py-16 bg-gradient-to-br from-pink-50 to-purple-50">
        <div className="container text-center">
          <div className="flex justify-center mb-6">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-pink-200 to-purple-200 flex items-center justify-center text-4xl font-bold text-primary">
              EZ
            </div>
          </div>
          <h2 className="text-4xl font-bold mb-4">High Heels Dance</h2>
          <p className="text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
            I'm a Pro dancer and dance teacher who can make you fall in love with dance...
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" size="icon" className="rounded-full">
              <Instagram className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full">
              <Youtube className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full">
              <Facebook className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Courses Section */}
      <section className="py-16">
        <div className="container">
          <h3 className="text-3xl font-bold mb-8 text-center">Dance Courses</h3>
          
          {isLoading ? (
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
          ) : courses && courses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="h-48 bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center">
                    {course.imageUrl ? (
                      <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-6xl">💃</span>
                    )}
                  </div>
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <CardTitle className="text-xl">{course.title}</CardTitle>
                      {course.isFree && (
                        <Badge variant="secondary">Free</Badge>
                      )}
                    </div>
                    <CardDescription className="line-clamp-2">{course.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary">
                        {course.isFree ? 'Free' : `€${course.price}`}
                      </span>
                      {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                        <span className="text-lg text-muted-foreground line-through">
                          €{course.originalPrice}
                        </span>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Link href={`/course/${course.id}`} className="w-full">
                      <Button className="w-full">
                        {course.isFree ? 'View Course' : 'Learn More'}
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No courses available at the moment.</p>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-card">
        <div className="container text-center text-muted-foreground">
          <p>&copy; 2026 High Heels Dance - Elizabeth Zolotova. All rights reserved.</p>
        </div>
      </footer>

      {/* Floating Chat Button */}
      <Button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg"
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
    </div>
  );
}
