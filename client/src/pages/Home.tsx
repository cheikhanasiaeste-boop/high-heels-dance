import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Instagram, Youtube, Facebook, MessageCircle, Star, Play, ArrowRight, Sparkles } from "lucide-react";
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

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url);

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

  // Background: DB value → local static fallback (filter out empty/whitespace strings)
  const backgroundUrl = [heroBackgroundUrl, bgAnimationUrl, bgVideoUrl].find(u => u && u.trim()) || '/hero-bg.webp';

  const [prefersReducedMotion] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
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
        <div className="bg-gradient-to-r from-fuchsia-600 via-pink-500 to-purple-600 text-white py-2.5 px-4 text-center text-sm tracking-[0.04em]" style={{ fontFamily: 'var(--font-body)' }}>
          {effectiveBannerText}
        </div>
      )}

      {/* ── Header / Navigation ───────────────────────────────────────────── */}
      <header className="border-b border-stone-200/60 sticky top-0 z-50 backdrop-blur-xl bg-white/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="container py-3.5 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-[#831843] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>High Heels Dance</h1>

          <MobileNav onSignInClick={() => setShowAuthModal(true)} />

          <div className="hidden lg:flex items-center gap-2">
            <Link href={isAuthenticated ? "/my-bookings" : "/book-session"}>
              <button className={`px-6 py-2.5 text-sm font-medium transition-all duration-300 relative group ${
                isAuthenticated
                  ? "text-stone-600 hover:text-[#C026D3] hover:bg-stone-50"
                  : "text-white bg-[#C026D3] hover:bg-[#A21CAF] shadow-md hover:shadow-lg hover:shadow-[#C026D3]/15 rounded-full"
              }`}>
                {isAuthenticated ? "My Sessions" : "Book a Session"}
                {isAuthenticated && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#C026D3] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                )}
              </button>
            </Link>
            <Link href={isAuthenticated ? "/my-courses" : "/courses"}>
              <button className={`px-6 py-2.5 text-sm font-medium transition-all duration-300 relative group ${
                isAuthenticated
                  ? "text-stone-600 hover:text-[#C026D3] hover:bg-stone-50"
                  : "text-[#C026D3] bg-transparent border border-[#C026D3]/30 hover:border-[#C026D3]/60 hover:bg-[#C026D3]/5 rounded-full"
              }`}>
                {isAuthenticated ? "My Courses" : "Browse Courses"}
                {isAuthenticated && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#C026D3] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
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
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-5 py-2.5 text-sm font-medium text-stone-600 hover:text-[#C026D3] transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ──────────────────────────────────────────────────── */}
      <section className="relative py-16 md:py-28 overflow-hidden min-h-[540px] md:min-h-[680px] flex items-center bg-[#701A75]">
        {/* Background — video for .mp4/.webm, direct img for everything else */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {!prefersReducedMotion && isVideoUrl(backgroundUrl) ? (
            <video
              key={backgroundUrl}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover scale-105"
              style={{ filter: 'brightness(0.45) saturate(1.15)' }}
              onError={(e) => {
                const video = e.currentTarget;
                video.style.display = 'none';
                const fallbackImg = document.createElement('img');
                fallbackImg.src = '/hero-bg.webp';
                fallbackImg.alt = '';
                fallbackImg.className = video.className;
                fallbackImg.style.cssText = 'filter: brightness(0.45) saturate(1.15)';
                video.parentElement?.insertBefore(fallbackImg, video);
              }}
            >
              <source src={backgroundUrl} />
            </video>
          ) : (
            <img
              src={backgroundUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-105"
              style={{ filter: 'brightness(0.45) saturate(1.15)' }}
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src !== window.location.origin + '/hero-bg.webp') {
                  img.src = '/hero-bg.webp';
                }
              }}
            />
          )}
          {/* Warm cinematic overlay — burgundy tinted, not pure black */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#701A75]/70 via-[#701A75]/30 to-[#701A75]/80" />
        </div>

        <div className="container text-center relative z-10 px-4 md:px-6 w-full">
          {/* Profile picture */}
          <div className="flex justify-center mb-6 md:mb-8 animate-fade-up">
            <div className="relative inline-block">
              {/* Warm golden glow behind profile pic */}
              <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-fuchsia-400/40 via-purple-300/30 to-fuchsia-400/40 blur-md" />
              <img
                src={heroProfilePictureUrl || "/profile.jpg"}
                alt="Elizabeth Zolotova"
                className="relative w-28 h-28 md:w-44 md:h-44 rounded-full object-cover shadow-[0_8px_40px_rgba(0,0,0,0.3)] ring-[3px] ring-white/30"
                onError={(e) => { (e.target as HTMLImageElement).src = '/profile-photo.jpeg'; }}
              />
            </div>
          </div>

          {/* Name */}
          <h2
            className="text-4xl md:text-7xl font-semibold mb-3 md:mb-4 text-white tracking-tight animate-fade-up-delay-1"
            style={{ fontFamily: 'var(--font-display)', textShadow: '0 2px 20px rgba(0,0,0,0.3)' }}
          >
            {heroTitle || 'Elizabeth Zolotova'}
          </h2>

          {/* Elegant gold divider */}
          <div className="flex items-center justify-center gap-4 mb-4 md:mb-5 animate-fade-up-delay-1">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-fuchsia-400/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400/60 shadow-[0_0_8px_rgba(196,164,110,0.4)]" />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-fuchsia-400/50" />
          </div>

          {/* Tagline */}
          <p
            className="text-base md:text-xl mb-8 md:mb-11 max-w-lg mx-auto leading-relaxed text-white/75 tracking-wide animate-fade-up-delay-2"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
          >
            {heroTagline || "Professional dancer & teacher — fall in love with dance."}
          </p>

          {/* Social links */}
          <div className="flex justify-center gap-3 md:gap-4 mb-8 md:mb-10 animate-fade-up-delay-2">
            {[
              { href: "https://www.instagram.com/elizabeth_zolotova/", Icon: Instagram },
              { href: "https://www.youtube.com/@HighHeelsTutorials", Icon: Youtube },
              { href: "https://www.facebook.com/liza.zolotova.399/", Icon: Facebook },
            ].map(({ href, Icon }) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/20 bg-white/[0.07] text-white/80 hover:bg-white/15 hover:border-white/40 hover:text-white backdrop-blur-sm transition-all duration-300 hover:scale-110">
                  <Icon className="h-4 w-4" />
                </span>
              </a>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-3 md:gap-4 animate-fade-up-delay-3">
            <Link href="/book-session">
              <span className="inline-flex items-center gap-2 px-8 md:px-10 py-3.5 md:py-4 text-sm md:text-base font-semibold text-white bg-[#C026D3] hover:bg-[#A21CAF] rounded-full shadow-lg hover:shadow-xl hover:shadow-[#C026D3]/25 transition-all duration-300 hover:-translate-y-0.5 tracking-wide cursor-pointer">
                Book a Dance Session
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
            <Link href="/courses">
              <span className="inline-flex items-center gap-2 px-8 md:px-10 py-3.5 md:py-4 text-sm md:text-base font-medium text-white/90 bg-white/[0.08] hover:bg-white/[0.15] border border-white/20 hover:border-white/35 rounded-full backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 tracking-wide cursor-pointer">
                Explore Courses
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Floating upcoming sessions widget */}
      <UpcomingSessionsWidget />

      {/* ── Courses Section ───────────────────────────────────────────────── */}
      <section className="py-16 md:py-28 bg-[#FDF4FF] relative overflow-hidden">
        {/* Subtle warm ambient glow */}
        <div className="absolute inset-0 opacity-[0.03] z-0">
          <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-400 rounded-full blur-[120px]" />
          <div className="absolute bottom-20 right-10 w-[400px] h-[400px] bg-purple-300 rounded-full blur-[120px]" />
        </div>
        <div className="container relative z-10">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-[0.3em] text-[#C026D3]/50 font-semibold mb-3" style={{ fontFamily: 'var(--font-body)' }}>Learn with passion</p>
            <h3 className="text-3xl md:text-5xl font-semibold mb-3 md:mb-4 text-[#831843] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {coursesHeading || 'Dance Courses'}
            </h3>
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#E879F9]/40" />
              <div className="w-1 h-1 rounded-full bg-[#E879F9]/50" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#E879F9]/40" />
            </div>
            <p className="text-base md:text-lg text-stone-500 max-w-xl mx-auto mb-9 md:mb-11 leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
              Professionally designed courses for every level — from your very first steps to stage performance
            </p>

            {/* Filter tabs */}
            <div className="inline-flex items-center gap-1 bg-white p-1 rounded-full shadow-sm border border-stone-200/70">
              <button
                onClick={() => setCourseFilter('all')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  courseFilter === 'all'
                    ? 'bg-[#C026D3] text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }`}
              >
                All
                {courseFilter === 'all' && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded-full text-xs font-bold">
                    {displayCourses.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setCourseFilter('free')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  courseFilter === 'free'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }`}
              >
                Free
                {courseFilter === 'free' && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded-full text-xs font-bold">
                    {filteredCourses.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setCourseFilter('premium')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  courseFilter === 'premium'
                    ? 'bg-[#E879F9] text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }`}
              >
                Premium
                {courseFilter === 'premium' && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded-full text-xs font-bold">
                    {filteredCourses.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {filteredCourses.length > 0 ? (
            <div className="relative max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 items-stretch">
                {filteredCourses.slice(0, 6).map(course => (
                  <Link key={course.id} href={`/course/${course.id}`}>
                    <Card className="group overflow-hidden hover:shadow-xl hover:shadow-stone-200/60 transition-all duration-500 hover:-translate-y-1.5 border border-stone-200/60 bg-white flex flex-col h-full cursor-pointer">
                      {/* Thumbnail */}
                      <div className="relative">
                        {course.imageUrl ? (
                          <>
                            <img
                              src={course.imageUrl}
                              alt={course.title}
                              className="w-full h-52 object-cover rounded-t-lg transition-transform duration-700 group-hover:scale-[1.03]"
                            />
                            {course.isTopPick && (
                              <div className="absolute top-3 left-3 z-10">
                                <div className="bg-[#C026D3] text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5 tracking-wide">
                                  <Sparkles className="w-3 h-3" />
                                  TOP PICK
                                </div>
                              </div>
                            )}
                            {!course.isFree && (
                              <div className="absolute top-3 right-3 bg-[#E879F9] text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg tracking-wide">
                                PREMIUM
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-52 bg-gradient-to-br from-[#831843] via-[#86198F] to-[#701A75] rounded-t-lg flex items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 opacity-30">
                              <div className="absolute top-0 left-1/4 w-40 h-40 bg-[#C026D3] rounded-full blur-3xl" />
                              <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-[#E879F9] rounded-full blur-3xl" />
                            </div>
                            <span className="text-6xl relative z-10 transition-transform duration-500 group-hover:scale-110">👠</span>
                            {course.isTopPick && (
                              <div className="absolute top-3 left-3 z-10">
                                <div className="bg-white/15 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5 tracking-wide border border-white/20">
                                  <Sparkles className="w-3 h-3" />
                                  TOP PICK
                                </div>
                              </div>
                            )}
                            {!course.isFree && (
                              <div className="absolute top-3 right-3 bg-[#E879F9]/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg tracking-wide">
                                PREMIUM
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <CardHeader className="pb-3 flex-grow">
                        <div className="flex justify-between items-start mb-2">
                          <CardTitle className="text-lg font-semibold text-[#831843] group-hover:text-[#C026D3] transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
                            {course.title}
                          </CardTitle>
                          {course.isFree && (
                            <Badge className="bg-emerald-700 text-white border-0 shadow-sm shrink-0 text-xs">
                              Free
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="line-clamp-3 text-sm leading-relaxed text-stone-500">
                          {course.description}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="pb-4">
                        <div className="flex items-baseline gap-2">
                          {course.isFree ? (
                            <span className="text-3xl font-bold text-emerald-700" style={{ fontFamily: 'var(--font-display)' }}>
                              Free
                            </span>
                          ) : (
                            <>
                              <span className="text-3xl font-bold text-[#831843]" style={{ fontFamily: 'var(--font-display)' }}>
                                €{course.price}
                              </span>
                              {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                                <span className="text-lg text-stone-400 line-through">
                                  €{course.originalPrice}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </CardContent>

                      <CardFooter className="mt-auto">
                        <div className="w-full text-sm py-3.5 bg-[#C026D3] hover:bg-[#A21CAF] shadow-sm hover:shadow-md transition-all duration-300 group-hover:shadow-[#C026D3]/15 rounded-md flex items-center justify-center text-white font-medium tracking-wide gap-2">
                          <span>Enroll Now</span>
                          <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                        </div>
                      </CardFooter>
                    </Card>
                  </Link>
                ))}
              </div>

              {filteredCourses.length > 6 && (
                <div className="flex justify-center mt-10">
                  <Button size="sm" variant="outline" className="shadow-sm border-stone-300 text-stone-600 hover:bg-stone-50 hover:border-stone-400 font-medium rounded-full px-6" asChild>
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
      <section className="py-16 md:py-28 bg-[#701A75] relative overflow-hidden">
        {/* Subtle ambient glows */}
        <div className="absolute inset-0 opacity-15">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#C026D3] rounded-full blur-[150px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#E879F9] rounded-full blur-[150px]" />
        </div>
        <div className="container relative z-10">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E879F9]/60 font-semibold mb-3" style={{ fontFamily: 'var(--font-body)' }}>Their words</p>
            <h3 className="text-3xl md:text-5xl font-semibold mb-3 text-white/95 tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {testimonialsHeading || 'Student Success Stories'}
            </h3>
            <div className="flex items-center justify-center gap-4 mb-5">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#E879F9]/30" />
              <div className="w-1 h-1 rounded-full bg-[#E879F9]/40" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#E879F9]/30" />
            </div>
            <p className="text-base md:text-lg text-white/40 max-w-xl mx-auto" style={{ fontFamily: 'var(--font-body)' }}>
              Hear from our students about their transformation
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
                      className="h-full cursor-pointer hover:shadow-xl transition-all duration-300 group bg-white/[0.06] backdrop-blur-sm border-white/[0.08] hover:bg-white/[0.10] hover:border-white/[0.12]"
                      onClick={() => setSelectedVideo(testimonial)}
                    >
                      <div className="relative aspect-video bg-gradient-to-br from-[#831843] to-[#701A75] overflow-hidden">
                        <video
                          data-src={(testimonial as any).videoUrl}
                          data-lazy="true"
                          className="w-full h-full object-cover"
                          preload="none"
                          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect fill='%234A1225' width='16' height='9'/%3E%3C/svg%3E"
                        />
                        <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                          <div className="bg-white/90 rounded-full p-3.5 group-hover:scale-110 transition-transform shadow-lg">
                            <Play className="h-7 w-7 text-[#C026D3] fill-[#C026D3]" />
                          </div>
                        </div>
                      </div>
                      <CardHeader>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#C026D3]/40 flex items-center justify-center font-semibold text-white/70 text-sm">
                              {testimonial.userName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <CardTitle className="text-sm text-white/85">{testimonial.userName}</CardTitle>
                              <div className="flex gap-0.5 mt-1">
                                {Array.from({ length: testimonial.rating }).map((_, i) => (
                                  <Star key={i} className="h-3 w-3 fill-[#E879F9] text-[#E879F9]" />
                                ))}
                              </div>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-white/10 text-white/60 border-0 text-xs">Video</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-white/40 line-clamp-2 italic" style={{ fontFamily: 'var(--font-display)' }}>"{testimonial.review}"</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="h-full bg-white/[0.06] backdrop-blur-sm border-white/[0.08] hover:bg-white/[0.10] hover:border-white/[0.12] transition-all duration-300">
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-11 h-11 rounded-full bg-[#C026D3]/30 flex items-center justify-center font-semibold text-white/60 text-base">
                            {testimonial.userName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-sm text-white/85">{testimonial.userName}</CardTitle>
                            <div className="flex gap-0.5 mt-1">
                              {Array.from({ length: testimonial.rating }).map((_, i) => (
                                <Star key={i} className="h-3.5 w-3.5 fill-[#E879F9] text-[#E879F9]" />
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-white/45 italic leading-relaxed" style={{ fontFamily: 'var(--font-display)' }}>"{testimonial.review}"</p>
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
      <footer className="border-t border-stone-200/50 py-10 bg-[#FDF4FF]">
        <div className="container text-center">
          <p className="text-sm text-stone-400 tracking-wide" style={{ fontFamily: 'var(--font-body)' }}>&copy; 2026 High Heels Dance — Elizabeth Zolotova. All rights reserved.</p>
        </div>
      </footer>

      {/* ── Floating Chat ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg hover:shadow-xl bg-[#C026D3] hover:bg-[#A21CAF] text-white flex items-center justify-center transition-all duration-300 hover:scale-105 z-40"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

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
