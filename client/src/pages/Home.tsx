import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Instagram, Youtube, Facebook, MessageCircle, Star, Play } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import ChatWidget from "@/components/ChatWidget";
import { WebsitePopup } from "@/components/WebsitePopup";
import { UserProfileDropdown } from '@/components/UserProfileDropdown';
import { UpcomingSessionsWidget } from '@/components/UpcomingSessionsWidget';
import { MobileNav } from "@/components/MobileNav";
import { useProgressiveAuth } from '@/hooks/useProgressiveAuth';
import { ProgressiveAuthModal } from '@/components/ProgressiveAuthModal';
import { AuthModal } from '@/components/AuthModal';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";

// ─── Fallback demo data (shown when database is not yet connected) ────────────

const DEMO_COURSES = [
  {
    id: 1001,
    title: "High Heels Basics",
    description: "Perfect for beginners! Learn the fundamentals of dancing in heels — posture, balance, and your first choreography steps. No experience needed.",
    price: "0",
    originalPrice: null as string | null,
    isFree: true,
    isTopPick: true,
    imageUrl: null as string | null,
  },
  {
    id: 1002,
    title: "Sensual Dance Foundations",
    description: "Discover the art of sensual movement. Build confidence, body awareness, and feminine expression through guided exercises and choreography.",
    price: "49",
    originalPrice: "98",
    isFree: false,
    isTopPick: false,
    imageUrl: null as string | null,
  },
  {
    id: 1003,
    title: "Advanced Heel Choreography",
    description: "Ready to go beyond the basics? This course teaches full performance-level choreography in high heels, from floor work to advanced transitions.",
    price: "79",
    originalPrice: null as string | null,
    isFree: false,
    isTopPick: true,
    imageUrl: null as string | null,
  },
  {
    id: 1004,
    title: "Body Isolation & Fluidity",
    description: "Master the art of body isolations — hips, ribcage, arms — for smoother, more expressive movement in any dance style.",
    price: "59",
    originalPrice: null as string | null,
    isFree: false,
    isTopPick: false,
    imageUrl: null as string | null,
  },
  {
    id: 1005,
    title: "Feminine Movement Masterclass",
    description: "A free introduction to feminine movement principles. Ideal for dancers at any level who want to add grace and expressiveness to their style.",
    price: "0",
    originalPrice: null as string | null,
    isFree: true,
    isTopPick: false,
    imageUrl: null as string | null,
  },
  {
    id: 1006,
    title: "Stage Presence & Performance",
    description: "Learn to command any stage. This course covers performance energy, audience connection, and polished presentation for competitions and showcases.",
    price: "99",
    originalPrice: null as string | null,
    isFree: false,
    isTopPick: false,
    imageUrl: null as string | null,
  },
];

const DEMO_TESTIMONIALS = [
  {
    id: 2001,
    userName: "Sarah M.",
    review: "Elizabeth is an absolutely incredible teacher! I had zero experience and after just a few lessons I was dancing in heels with real confidence. The courses are so well-structured and genuinely fun.",
    rating: 5,
    isFeatured: true,
    type: 'text' as const,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2002,
    userName: "Anna K.",
    review: "I never thought I could dance in heels — I was terrified of falling! Elizabeth's teaching style is so warm and encouraging. Now I actually look forward to wearing heels every day.",
    rating: 5,
    isFeatured: true,
    type: 'text' as const,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2003,
    userName: "Maria L.",
    review: "The Advanced Heel Choreography course changed my life. The progression is perfect — challenging but never discouraging. I performed at a local showcase after just 3 months!",
    rating: 5,
    isFeatured: false,
    type: 'text' as const,
    createdAt: new Date().toISOString(),
  },
];

const FALLBACK_POPUP = {
  id: 9001,
  enabled: true,
  title: "Welcome to High Heels Dance! 💃",
  message: "Join my dance community and get exclusive updates on new courses and special offers!",
  imageUrl: "/banner.jpg",
  buttonText: "Ready to dance 🚀",
  showEmailInput: false,
  emailPlaceholder: null as string | null,
  backgroundColor: null as string | null,
  textColor: null as string | null,
};

const FALLBACK_BANNER = "🎉 Special offer: 50% off all courses this week! Use code DANCE50";

// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { isAuthModalOpen, authContext, authContextDetails, closeAuthModal } = useProgressiveAuth();

  const { data: courses } = trpc.courses.list.useQuery();
  const { data: myPurchases } = trpc.purchases.myPurchases.useQuery(undefined, { enabled: isAuthenticated });
  const { data: unreadCount } = trpc.messages.unreadCount.useQuery(undefined, { enabled: isAuthenticated });
  const { data: banner } = trpc.banner.get.useQuery();
  const { data: textTestimonials } = trpc.testimonials.list.useQuery();
  const { data: videoTestimonials } = trpc.testimonials.videoTestimonials.useQuery();
  const { data: popupSettings } = trpc.popup.get.useQuery();

  const recordInteractionMutation = trpc.popup.recordInteraction.useMutation();

  // Editable content from admin
  const { data: heroTitle } = trpc.admin.content.get.useQuery({ key: 'hero_title' });
  const { data: heroTagline } = trpc.admin.content.get.useQuery({ key: 'hero_tagline' });
  const { data: coursesHeading } = trpc.admin.content.get.useQuery({ key: 'courses_heading' });
  const { data: testimonialsHeading } = trpc.admin.content.get.useQuery({ key: 'testimonials_heading' });
  const { data: heroBackgroundUrl } = trpc.admin.settings.get.useQuery({ key: "heroBackgroundUrl" });
  const { data: bgAnimationUrl } = trpc.admin.settings.get.useQuery({ key: "backgroundAnimationUrl" });
  const { data: bgVideoUrl } = trpc.admin.settings.get.useQuery({ key: "backgroundVideoUrl" });
  const { data: heroProfilePictureUrl } = trpc.admin.settings.get.useQuery({ key: "heroProfilePictureUrl" });

  // Background: DB value → local static fallback
  const backgroundUrl = heroBackgroundUrl || bgAnimationUrl || bgVideoUrl || '/hero-bg.webp';

  const [prefersReducedMotion] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [courseFilter, setCourseFilter] = useState<'all' | 'free' | 'premium'>('all');

  // Use DB courses when available; otherwise show demo courses immediately
  const displayCourses = (courses && courses.length > 0) ? courses : DEMO_COURSES;

  const enrolledCourseIds = new Set(myPurchases?.map((p: any) => p.courseId) || []);
  const filteredCourses = displayCourses
    .filter(course => {
      if (isAuthenticated && enrolledCourseIds.has(course.id)) return false;
      if (courseFilter === 'free') return course.isFree;
      if (courseFilter === 'premium') return !course.isFree;
      return true;
    })
    .sort((a, b) => {
      if (a.isTopPick && !b.isTopPick) return -1;
      if (!a.isTopPick && b.isTopPick) return 1;
      return b.id - a.id;
    });

  // Use DB testimonials when available; otherwise show demo testimonials immediately
  const displayTextTestimonials = (textTestimonials && textTestimonials.length > 0) ? textTestimonials : DEMO_TESTIMONIALS;

  const allTestimonials = [
    ...displayTextTestimonials.map(t => ({ ...t, type: 'text' as const })),
    ...(videoTestimonials || []).map(t => ({ ...t, type: 'video' as const })),
  ].sort((a, b) => {
    if (a.isFeatured && !b.isFeatured) return -1;
    if (!a.isFeatured && b.isFeatured) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Banner: show DB value when enabled; otherwise always show fallback immediately
  const effectiveBannerText = (banner?.enabled && banner.text) ? banner.text : FALLBACK_BANNER;

  // Popup: use DB settings when enabled; otherwise show fallback immediately
  const effectivePopupSettings = (popupSettings?.enabled) ? popupSettings : FALLBACK_POPUP;

  // Lazy-load videos inside testimonials
  useEffect(() => {
    const videoElements = document.querySelectorAll('video[data-lazy="true"]');
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const video = entry.target as HTMLVideoElement;
            if (video.dataset.src) {
              video.src = video.dataset.src;
              video.removeAttribute('data-src');
              video.removeAttribute('data-lazy');
              observer.unobserve(video);
            }
          }
        });
      },
      { rootMargin: '50px' }
    );
    videoElements.forEach(v => observer.observe(v));
    return () => videoElements.forEach(v => observer.unobserve(v));
  }, [allTestimonials]);

  return (
    <div className="min-h-screen">

      {/* ── Auth Modal ────────────────────────────────────────────────────── */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* ── Website Popup ─────────────────────────────────────────────────── */}
      <WebsitePopup
        settings={effectivePopupSettings}
        onDismiss={popupId => {
          if (popupId !== 9001) {
            recordInteractionMutation.mutate({ popupId, action: 'dismissed' });
          }
        }}
        onEmailSubmit={(popupId, email) => {
          if (popupId !== 9001) {
            recordInteractionMutation.mutate({ popupId, action: 'email_submitted', email });
          }
        }}
      />

      {/* ── Announcement Banner ───────────────────────────────────────────── */}
      {effectiveBannerText && (
        <div className="bg-primary text-primary-foreground py-3 px-4 text-center font-medium text-sm md:text-base">
          {effectiveBannerText}
        </div>
      )}

      {/* ── Header / Navigation ───────────────────────────────────────────── */}
      <header className="border-b bg-card sticky top-0 z-50 backdrop-blur-sm bg-white/95">
        <div className="container py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">High Heels Dance</h1>

          <MobileNav onSignInClick={() => setShowAuthModal(true)} />

          <div className="hidden lg:flex items-center gap-1">
            <Link href={isAuthenticated ? "/my-bookings" : "/book-session"}>
              <button className={`px-6 py-2.5 text-sm font-medium transition-all duration-200 relative group ${
                isAuthenticated
                  ? "text-gray-700 hover:text-primary hover:bg-purple-50/50"
                  : "text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-md hover:shadow-lg hover:scale-105 rounded-full"
              }`}>
                {isAuthenticated ? "My Sessions" : "Book a Session"}
                {isAuthenticated && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                )}
              </button>
            </Link>
            <Link href={isAuthenticated ? "/my-courses" : "/courses"}>
              <button className={`px-6 py-2.5 text-sm font-medium transition-all duration-200 relative group ${
                isAuthenticated
                  ? "text-gray-700 hover:text-primary hover:bg-purple-50/50"
                  : "text-purple-700 bg-white border-2 border-purple-600 hover:bg-purple-50 hover:border-purple-700 shadow-md hover:shadow-lg hover:scale-105 rounded-full"
              }`}>
                {isAuthenticated ? "My Courses" : "Browse Courses"}
                {isAuthenticated && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                )}
              </button>
            </Link>
            {isAuthenticated ? (
              <>
                {user?.role === 'admin' && (
                  <Button variant="outline" asChild>
                    <Link href="/admin">Admin</Link>
                  </Button>
                )}
                <UserProfileDropdown unreadMessagesCount={unreadCount || 0} />
              </>
            ) : (
              <Button onClick={() => setShowAuthModal(true)}>Sign In</Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ──────────────────────────────────────────────────── */}
      <section className="relative py-12 md:py-20 overflow-hidden min-h-[520px] md:min-h-[620px] flex items-center">
        {/* Background — animated WebP rendered as video for smooth playback, img fallback */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {!prefersReducedMotion && !heroVideoFailed ? (
            <video
              key={backgroundUrl}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.78, filter: 'saturate(1.2) brightness(0.75)' }}
              onError={() => setHeroVideoFailed(true)}
            >
              <source src={backgroundUrl} />
            </video>
          ) : (
            <img
              src={backgroundUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.78, filter: 'saturate(1.2) brightness(0.75)' }}
            />
          )}
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
        </div>

        <div className="container text-center relative z-10 px-4 md:px-6 w-full">
          {/* Profile picture */}
          <div className="flex justify-center mb-4 md:mb-6">
            <img
              src={heroProfilePictureUrl || "/profile.jpg"}
              alt="Elizabeth Zolotova"
              className="w-24 h-24 md:w-40 md:h-40 rounded-full object-cover shadow-2xl ring-4 ring-white/40 object-top"
            />
          </div>

          {/* Name */}
          <h2 className="text-3xl md:text-5xl font-bold mb-3 md:mb-4 text-white drop-shadow-xl">
            {heroTitle || 'Elizabeth Zolotova'}
          </h2>

          {/* Tagline */}
          <p className="text-base md:text-xl mb-6 md:mb-10 max-w-2xl mx-auto leading-relaxed text-white/90 font-medium drop-shadow">
            {heroTagline || "I'm a professional dancer and teacher who will make you fall in love with dance."}
          </p>

          {/* Social links */}
          <div className="flex justify-center gap-3 md:gap-4 mb-6 md:mb-8">
            <a href="https://www.instagram.com/elizabeth_zolotova/" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="icon-sm" className="rounded-full bg-white/15 border-white/40 hover:bg-white/30 text-white backdrop-blur-sm transition-colors">
                <Instagram className="h-4 w-4" />
              </Button>
            </a>
            <a href="https://www.youtube.com/@HighHeelsTutorials" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="icon-sm" className="rounded-full bg-white/15 border-white/40 hover:bg-white/30 text-white backdrop-blur-sm transition-colors">
                <Youtube className="h-4 w-4" />
              </Button>
            </a>
            <a href="https://www.facebook.com/liza.zolotova.399/" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="icon-sm" className="rounded-full bg-white/15 border-white/40 hover:bg-white/30 text-white backdrop-blur-sm transition-colors">
                <Facebook className="h-4 w-4" />
              </Button>
            </a>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col md:flex-row justify-center gap-3 md:gap-6">
            <Button
              size="lg"
              className="shadow-2xl px-6 md:px-10 py-2 md:py-7 text-sm md:text-lg font-bold bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 transition-all duration-300 hover:scale-105"
              asChild
            >
              <Link href="/book-session">Book a Dance Session</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="shadow-2xl px-6 md:px-10 py-2 md:py-7 text-sm md:text-lg font-bold border-2 border-white/60 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-300 hover:scale-105"
              asChild
            >
              <Link href="/courses">Explore Courses</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Floating upcoming sessions widget */}
      <UpcomingSessionsWidget />

      {/* ── Courses Section ───────────────────────────────────────────────── */}
      <section className="py-12 md:py-20 bg-gradient-to-b from-white via-pink-50/30 to-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 z-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-pink-400 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400 rounded-full blur-3xl" />
        </div>
        <div className="container relative z-10">
          <div className="text-center mb-16">
            <h3 className="text-3xl md:text-5xl font-bold mb-2 md:mb-4 bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {coursesHeading || 'Dance Courses'}
            </h3>
            <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 md:mb-10 leading-relaxed">
              Transform your dance skills with professionally designed courses for all levels
            </p>

            {/* Filter tabs */}
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-md p-2 rounded-full shadow-lg border border-pink-100">
              <button
                onClick={() => setCourseFilter('all')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-1.5 ${
                  courseFilter === 'all'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <span className="text-base">🌟</span>
                All Courses
                {courseFilter === 'all' && (
                  <span className="ml-1 px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold">
                    {displayCourses.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setCourseFilter('free')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-1.5 ${
                  courseFilter === 'free'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <span className="text-base">🎁</span>
                Free
                {courseFilter === 'free' && (
                  <span className="ml-1 px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold">
                    {filteredCourses.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setCourseFilter('premium')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-1.5 ${
                  courseFilter === 'premium'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <span className="text-base">✨</span>
                Premium
                {courseFilter === 'premium' && (
                  <span className="ml-1 px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold">
                    {filteredCourses.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {filteredCourses.length > 0 ? (
            <div className="relative max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
                {filteredCourses.slice(0, 6).map(course => (
                  <Link key={course.id} href={`/course/${course.id}`}>
                    <Card className="group overflow-hidden hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border-0 bg-white/90 backdrop-blur-sm flex flex-col h-full cursor-pointer">
                      {/* Thumbnail */}
                      <div className="relative">
                        {course.imageUrl ? (
                          <>
                            <img
                              src={course.imageUrl}
                              alt={course.title}
                              className="w-full h-48 object-cover rounded-t-lg"
                            />
                            {/* Badges on real images */}
                            {course.isTopPick && (
                              <div className="absolute top-4 left-4 z-10">
                                <div className="relative">
                                  <div className="absolute -inset-2 bg-gradient-to-r from-pink-400 via-fuchsia-400 to-purple-400 rounded-full blur-md opacity-75" />
                                  <div className="relative bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-extrabold shadow-2xl flex items-center gap-2 border-2 border-pink-300/80">
                                    <span className="text-lg">⭐</span>
                                    <span className="tracking-wider">TOP PICK</span>
                                  </div>
                                </div>
                              </div>
                            )}
                            {!course.isFree && (
                              <div className="absolute top-4 right-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-1">
                                <span>✨</span> PREMIUM
                              </div>
                            )}
                          </>
                        ) : (
                          /* Gradient placeholder when no image */
                          <div className="w-full h-48 bg-gradient-to-br from-pink-900 via-purple-900 to-pink-800 rounded-t-lg flex items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 opacity-30">
                              <div className="absolute top-0 left-1/4 w-32 h-32 bg-pink-400 rounded-full blur-2xl" />
                              <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-purple-400 rounded-full blur-2xl" />
                            </div>
                            <span className="text-6xl relative z-10">💃</span>
                            {course.isTopPick && (
                              <div className="absolute top-4 left-4 z-10">
                                <div className="relative">
                                  <div className="absolute -inset-2 bg-gradient-to-r from-pink-400 via-fuchsia-400 to-purple-400 rounded-full blur-md opacity-75" />
                                  <div className="relative bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-extrabold shadow-2xl flex items-center gap-2 border-2 border-pink-300/80">
                                    <span className="text-lg">⭐</span>
                                    <span className="tracking-wider">TOP PICK</span>
                                  </div>
                                </div>
                              </div>
                            )}
                            {!course.isFree && (
                              <div className="absolute top-4 right-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-1">
                                <span>✨</span> PREMIUM
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <CardHeader className="pb-4 flex-grow">
                        <div className="flex justify-between items-start mb-3">
                          <CardTitle className="text-xl font-bold group-hover:text-pink-600 transition-colors">
                            {course.title}
                          </CardTitle>
                          {course.isFree && (
                            <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-md shrink-0">
                              Free
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="line-clamp-3 text-base leading-relaxed text-gray-600">
                          {course.description}
                        </CardDescription>
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

                      <CardFooter className="mt-auto">
                        <div className="w-full text-lg py-6 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-105 rounded-md flex items-center justify-center text-white font-medium">
                          ✧ Enroll Now
                        </div>
                      </CardFooter>
                    </Card>
                  </Link>
                ))}
              </div>

              {filteredCourses.length > 6 && (
                <div className="flex justify-center mt-8">
                  <Button size="sm" variant="outline" className="shadow-sm border-gray-300 text-gray-700 hover:bg-gray-50 font-medium" asChild>
                    <Link href="/courses">View All {filteredCourses.length} Courses</Link>
                  </Button>
                </div>
              )}
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
                  size="sm"
                  onClick={() => setCourseFilter('all')}
                  className="mt-4 border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  View All Courses
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Testimonials Section ──────────────────────────────────────────── */}
      <section className="py-12 md:py-20 bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50">
        <div className="container">
          <div className="text-center mb-12">
            <h3 className="text-4xl font-bold mb-4">
              {testimonialsHeading || 'Student Success Stories'}
            </h3>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Hear from our amazing students about their dance journey
            </p>
          </div>
          <Carousel
            opts={{ align: "start", loop: true }}
            plugins={[Autoplay({ delay: 6000 })]}
            className="w-full max-w-6xl mx-auto"
          >
            <CarouselContent>
              {allTestimonials.map((testimonial, index) => (
                <CarouselItem
                  key={`${testimonial.type}-${testimonial.id}-${index}`}
                  className="md:basis-1/2 lg:basis-1/3"
                >
                  {testimonial.type === 'video' && (testimonial as any).videoUrl ? (
                    <Card
                      className="h-full cursor-pointer hover:shadow-xl transition-shadow group"
                      onClick={() => setSelectedVideo(testimonial)}
                    >
                      <div className="relative aspect-video bg-gradient-to-br from-pink-100 to-purple-100 overflow-hidden">
                        <video
                          data-src={(testimonial as any).videoUrl}
                          data-lazy="true"
                          className="w-full h-full object-cover"
                          preload="none"
                          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect fill='%23f9a8d4' width='16' height='9'/%3E%3C/svg%3E"
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

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t py-8 bg-card">
        <div className="container text-center text-muted-foreground">
          <p>&copy; 2026 High Heels Dance - Elizabeth Zolotova. All rights reserved.</p>
        </div>
      </footer>

      {/* ── Floating Chat ─────────────────────────────────────────────────── */}
      <Button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-shadow"
        size="icon-sm"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {showChat && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] z-50">
          <ChatWidget onClose={() => setShowChat(false)} />
        </div>
      )}

      {/* ── Video Player Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="flex items-center gap-1">
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
              </span>
              <span>{selectedVideo?.userName}</span>
            </DialogTitle>
          </DialogHeader>
          {selectedVideo?.videoUrl && (
            <div className="space-y-4">
              <video src={selectedVideo.videoUrl} controls autoPlay className="w-full rounded-lg" />
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

      {/* ── Progressive Auth Modal ────────────────────────────────────────── */}
      <ProgressiveAuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        context={authContext || 'booking'}
        contextDetails={authContextDetails}
      />
    </div>
  );
}
