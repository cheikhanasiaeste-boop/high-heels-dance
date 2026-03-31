import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Instagram, Youtube, Facebook, MessageCircle, Star, Play, ArrowRight } from "lucide-react";
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
import { ScrollReveal } from "@/components/ScrollReveal";

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
  const { data: banner, isLoading: bannerLoading } = trpc.banner.get.useQuery();
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

  // Banner: show DB value when loaded, nothing while loading — prevents text flash
  const effectiveBannerText = bannerLoading ? null : (banner?.enabled && banner.text) ? banner.text : FALLBACK_BANNER;

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
    <div className="min-h-screen overflow-x-hidden">

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

      {/* ── Header / Navigation ───────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-50 border-b border-white/[0.08]">
        <div className="container px-4 py-5 flex justify-between items-center">
          <h1 className="text-sm sm:text-base font-bold text-white uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-body)' }}>High Heels Dance</h1>

          <MobileNav onSignInClick={() => setShowAuthModal(true)} />

          {/* Center nav links — desktop */}
          <nav className="hidden lg:flex items-center gap-8">
            <Link href="/courses">
              <span className="text-sm font-medium text-white/70 uppercase tracking-[0.15em] hover:text-white transition-colors cursor-pointer">Courses</span>
            </Link>
            <Link href="/book-session">
              <span className="text-sm font-medium text-white/70 uppercase tracking-[0.15em] hover:text-white transition-colors cursor-pointer">Book Session</span>
            </Link>
            <Link href="/membership">
              <span className="text-sm font-medium text-white/70 uppercase tracking-[0.15em] hover:text-white transition-colors cursor-pointer">Membership</span>
            </Link>
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <button className="px-6 py-2.5 text-sm font-semibold text-[#1a0a1e] bg-white hover:bg-white/90 rounded-full transition-all duration-300 uppercase tracking-[0.08em]">
                    My Studio
                  </button>
                </Link>
                {user?.role === 'admin' && (
                  <Link href="/admin">
                    <button className="px-4 py-2.5 text-xs font-medium text-white/70 border border-white/20 hover:border-white/40 hover:text-white rounded-full transition-all duration-300 uppercase tracking-[0.08em]">
                      Admin
                    </button>
                  </Link>
                )}
                <UserProfileDropdown unreadMessagesCount={unreadCount || 0} />
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="text-[13px] font-medium text-white/70 uppercase tracking-[0.15em] hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <Link href="/book-session">
                  <button className="px-6 py-2.5 text-sm font-semibold text-[#1a0a1e] bg-white hover:bg-white/90 rounded-full transition-all duration-300 uppercase tracking-[0.08em]">
                    Let's Dance
                    <ArrowRight className="w-3.5 h-3.5 inline ml-2 -mt-0.5" />
                  </button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-[100vh] flex flex-col bg-[#0d0010]">
        {/* Background — video for .mp4/.webm, direct img for everything else */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {!prefersReducedMotion && isVideoUrl(backgroundUrl) ? (
            <video
              key={backgroundUrl}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.35) saturate(1.2)' }}
              ref={(el) => {
                if (el) {
                  el.playbackRate = 1.2;
                  el.addEventListener('play', () => { el.playbackRate = 1.2; }, { once: false });
                }
              }}
              onError={(e) => {
                const video = e.currentTarget;
                video.style.display = 'none';
                const fallbackImg = document.createElement('img');
                fallbackImg.src = '/hero-bg.webp';
                fallbackImg.alt = '';
                fallbackImg.className = video.className;
                fallbackImg.style.cssText = 'filter: brightness(0.35) saturate(1.2)';
                video.parentElement?.insertBefore(fallbackImg, video);
              }}
            >
              <source src={backgroundUrl} />
            </video>
          ) : (
            <img
              src={backgroundUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.35) saturate(1.2)' }}
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src !== window.location.origin + '/hero-bg.webp') {
                  img.src = '/hero-bg.webp';
                }
              }}
            />
          )}
          {/* Darker gradient overlay for deep cinematic feel */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d0010]/60 via-transparent to-[#0d0010]" />
        </div>

        {/* Hero content — pushed down to leave room for transparent nav */}
        <div className="flex-1 flex items-center relative z-10">
          <div className="container px-4 md:px-6 w-full py-32 md:py-40">
            <div className="grid lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-center">
              {/* Left: Text content */}
              <div className="text-center lg:text-left animate-fade-up">
                {/* Label */}
                <p className="text-xs uppercase tracking-[0.3em] text-[#E879F9]/60 font-semibold mb-4 animate-fade-up" style={{ fontFamily: 'var(--font-body)' }}>
                  Professional Dance Education
                </p>

                {/* Name */}
                <h2
                  className="text-5xl md:text-7xl lg:text-8xl font-bold mb-5 md:mb-6 text-white tracking-[-0.03em] animate-fade-up-delay-1"
                  style={{ fontFamily: 'var(--font-display)', textShadow: '0 4px 40px rgba(0,0,0,0.5)' }}
                >
                  {heroTitle || 'Elizabeth Zolotova'}
                </h2>

                {/* Tagline */}
                <p
                  className="text-lg md:text-xl mb-8 md:mb-10 max-w-lg mx-auto lg:mx-0 leading-relaxed text-white/60 animate-fade-up-delay-2"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                >
                  {heroTagline || "Professional dancer & teacher — fall in love with dance."}
                </p>

                {/* CTA buttons */}
                <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-3 md:gap-4 mb-8 animate-fade-up-delay-3">
                  <Link href="/book-session">
                    <span className="glow-button inline-flex items-center gap-2.5 px-8 sm:px-10 py-4 text-sm font-semibold text-[#0d0010] bg-white hover:bg-white/90 rounded-full shadow-lg tracking-wide cursor-pointer uppercase">
                      Book a Session
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </Link>
                  <Link href="/courses">
                    <span className="inline-flex items-center gap-2 px-8 sm:px-10 py-4 text-sm font-medium text-white/80 bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-white/30 rounded-full backdrop-blur-sm transition-all duration-300 tracking-wide cursor-pointer uppercase">
                      Explore Courses
                    </span>
                  </Link>
                </div>

                {/* Social links */}
                <div className="flex justify-center lg:justify-start gap-3 animate-fade-up-delay-3">
                  {[
                    { href: "https://www.instagram.com/elizabeth_zolotova/", Icon: Instagram },
                    { href: "https://www.youtube.com/@HighHeelsTutorials", Icon: Youtube },
                    { href: "https://www.facebook.com/liza.zolotova.399/", Icon: Facebook },
                  ].map(({ href, Icon }) => (
                    <a key={href} href={href} target="_blank" rel="noopener noreferrer">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/[0.05] text-white/50 hover:bg-white/10 hover:border-white/25 hover:text-white transition-all duration-300">
                        <Icon className="h-4 w-4" />
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Right: Editorial profile photo */}
              <div className="hidden lg:block animate-fade-up-delay-2">
                <div className="relative">
                  {/* Fuchsia glow behind photo */}
                  <div className="absolute -inset-6 bg-gradient-to-br from-fuchsia-500/20 via-purple-500/10 to-transparent blur-3xl rounded-3xl" />
                  <img
                    src={heroProfilePictureUrl || "/profile.jpg"}
                    alt="Elizabeth Zolotova"
                    className="relative w-[320px] h-[420px] object-cover rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/profile-photo.jpeg'; }}
                  />
                  {/* Subtle label on image */}
                  <div className="absolute bottom-4 left-4 right-4 bg-black/40 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10">
                    <p className="text-white/90 text-sm font-semibold" style={{ fontFamily: 'var(--font-body)' }}>Elizabeth Zolotova</p>
                    <p className="text-white/50 text-xs">High Heels Dance Instructor</p>
                  </div>
                </div>
              </div>

              {/* Mobile: profile photo below CTAs */}
              <div className="lg:hidden flex justify-center animate-fade-up-delay-3">
                <div className="relative">
                  <div className="absolute -inset-4 bg-gradient-to-br from-fuchsia-500/20 via-purple-500/10 to-transparent blur-2xl rounded-2xl" />
                  <img
                    src={heroProfilePictureUrl || "/profile.jpg"}
                    alt="Elizabeth Zolotova"
                    className="relative w-48 h-64 object-cover rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] ring-1 ring-white/10"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/profile-photo.jpeg'; }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Floating upcoming sessions widget */}
      <UpcomingSessionsWidget />

      {/* ── Courses Section ───────────────────────────────────────────────── */}
      <section className="py-16 md:py-28 bg-[#0d0010] relative overflow-hidden">
        {/* Subtle ambient glow */}
        <div className="absolute inset-0 opacity-[0.06] z-0">
          <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px]" />
          <div className="absolute bottom-20 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px]" />
        </div>
        <div className="container relative z-10">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E879F9]/50 font-semibold mb-3" style={{ fontFamily: 'var(--font-body)' }}>Learn with passion</p>
            <h3 className="text-3xl md:text-[3.5rem] font-bold mb-3 md:mb-4 text-white tracking-[-0.02em]" style={{ fontFamily: 'var(--font-display)' }}>
              {coursesHeading || 'Dance Courses'}
            </h3>
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#E879F9]/30" />
              <div className="w-1 h-1 rounded-full bg-[#E879F9]/40" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#E879F9]/30" />
            </div>
            <p className="text-base md:text-lg text-white/40 max-w-xl mx-auto mb-9 md:mb-11 leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
              Professionally designed courses for every level — from your very first steps to stage performance
            </p>

            {/* Filter tabs */}
            <div className="inline-flex items-center gap-1 bg-white/[0.06] p-1 rounded-full border border-white/[0.08]">
              <button
                onClick={() => setCourseFilter('all')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  courseFilter === 'all'
                    ? 'bg-[#C026D3] text-white shadow-sm'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
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
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
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
                    : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 items-stretch">
                {filteredCourses.slice(0, 6).map((course, idx) => (
                  <ScrollReveal key={course.id} delay={idx * 0.08}>
                  <Link href={`/course/${course.id}`}>
                    <div className="group cursor-pointer">
                      {/* Large image */}
                      <div className="relative overflow-hidden rounded-xl mb-4">
                        {course.imageUrl ? (
                          <img
                            src={course.imageUrl}
                            alt={course.title}
                            className="w-full h-64 object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                          />
                        ) : (
                          <div className="w-full h-64 bg-gradient-to-br from-[#831843] via-[#86198F] to-[#701A75] flex items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 opacity-30">
                              <div className="absolute top-0 left-1/4 w-40 h-40 bg-[#C026D3] rounded-full blur-3xl" />
                              <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-[#E879F9] rounded-full blur-3xl" />
                            </div>
                            <span className="text-6xl relative z-10 transition-transform duration-500 group-hover:scale-110">👠</span>
                          </div>
                        )}
                        {/* Overlay badges */}
                        {course.isTopPick && (
                          <div className="absolute top-3 left-3 z-10">
                            <span className="uppercase text-[11px] font-bold tracking-[0.15em] text-white/80">{course.isFree ? 'Free' : `€${course.price}`}</span>
                          </div>
                        )}
                        <div className="absolute top-3 right-3">
                          <span className="uppercase text-[11px] font-bold tracking-[0.15em] text-white/80">
                            {course.isFree ? 'Free' : course.isTopPick ? 'Top Pick' : 'Premium'}
                          </span>
                        </div>
                        {/* Bottom gradient for readability */}
                        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
                      </div>
                      {/* Title + price */}
                      <h4 className="text-lg font-semibold text-white group-hover:text-[#E879F9] transition-colors mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                        {course.title}
                      </h4>
                      <p className="text-sm text-white/40 line-clamp-2 mb-3">{course.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                          {course.isFree ? 'Free' : `€${course.price}`}
                          {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                            <span className="ml-2 text-sm text-white/30 line-through font-normal">€{course.originalPrice}</span>
                          )}
                        </span>
                        <span className="text-sm font-medium text-[#E879F9] uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          View <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      {/* Separator line */}
                      <div className="mt-4 h-px bg-gradient-to-r from-[#E879F9]/30 via-[#C026D3]/20 to-transparent" />
                    </div>
                  </Link>
                  </ScrollReveal>
                ))}
              </div>

              {filteredCourses.length > 6 && (
                <div className="flex justify-center mt-12">
                  <Link href="/courses">
                    <button className="px-8 py-3 text-sm font-medium text-white/70 border border-white/15 hover:border-white/30 hover:text-white rounded-full transition-all duration-300 uppercase tracking-[0.1em]">
                      View All {filteredCourses.length} Courses
                    </button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-white/40 text-lg">
                {courseFilter === 'all'
                  ? 'No courses available at the moment. Check back soon!'
                  : `No ${courseFilter} courses available at the moment.`}
              </p>
              {courseFilter !== 'all' && (
                <button
                  onClick={() => setCourseFilter('all')}
                  className="mt-4 px-6 py-2 text-sm text-white/60 border border-white/15 hover:border-white/30 rounded-full transition-all"
                >
                  View All Courses
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Testimonials Section ──────────────────────────────────────────── */}
      <section className="py-20 md:py-32 bg-[#141118] relative overflow-hidden">
        <div className="container relative z-10">
          <Carousel
            opts={{ align: "center", loop: true }}
            plugins={[Autoplay({ delay: 6000 })]}
            className="w-full max-w-4xl mx-auto"
          >
            <CarouselContent>
              {allTestimonials.map((testimonial, index) => (
                <CarouselItem
                  key={`${testimonial.type}-${testimonial.id}-${index}`}
                  className="basis-full"
                >
                  {testimonial.type === 'video' && (testimonial as any).videoUrl ? (
                    <div
                      className="text-center px-4 cursor-pointer group"
                      onClick={() => setSelectedVideo(testimonial)}
                    >
                      {/* Play button for video testimonial */}
                      <div className="relative w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play className="h-8 w-8 text-white fill-white ml-1" />
                      </div>
                      <p className="text-xl md:text-2xl lg:text-3xl text-white/80 italic leading-relaxed max-w-3xl mx-auto mb-8" style={{ fontFamily: 'var(--font-display)' }}>
                        "{testimonial.review}"
                      </p>
                      <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-medium">
                        {testimonial.userName}, Student
                      </p>
                    </div>
                  ) : (
                    <div className="text-center px-4">
                      {/* Large quote marks */}
                      <div className="text-6xl md:text-7xl text-white/20 leading-none mb-2 select-none" style={{ fontFamily: 'Georgia, serif' }}>"</div>
                      {/* Avatar */}
                      <div className="w-16 h-16 mx-auto mb-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold ring-4 ring-fuchsia-500/20">
                        {testimonial.userName.charAt(0).toUpperCase()}
                      </div>
                      {/* Quote text */}
                      <p className="text-xl md:text-2xl lg:text-3xl text-white/80 italic leading-relaxed max-w-3xl mx-auto mb-8" style={{ fontFamily: 'var(--font-display)' }}>
                        "{testimonial.review}"
                      </p>
                      {/* Name */}
                      <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-medium">
                        {testimonial.userName}, Student
                      </p>
                    </div>
                  )}
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="hidden md:flex -left-12 border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white" />
            <CarouselNext className="hidden md:flex -right-12 border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white" />
          </Carousel>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-14 md:py-18 bg-[#0d0010]">
        <div className="container px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-[0.1em] mb-2" style={{ fontFamily: 'var(--font-body)' }}>High Heels Dance</h3>
              <p className="text-sm text-white/35">Professional dance education with Elizabeth Zolotova. Fall in love with dance.</p>
            </div>
            {/* Quick Links */}
            <div>
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-[0.15em] mb-3">Quick Links</h4>
              <div className="flex flex-col gap-2">
                <a href="/courses" className="text-sm text-white/40 hover:text-[#E879F9] transition-colors">Browse Courses</a>
                <a href="/book-session" className="text-sm text-white/40 hover:text-[#E879F9] transition-colors">Book a Session</a>
                <a href="/membership" className="text-sm text-white/40 hover:text-[#E879F9] transition-colors">Membership</a>
              </div>
            </div>
            {/* Contact */}
            <div>
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-[0.15em] mb-3">Connect</h4>
              <div className="flex flex-col gap-2">
                <a href="https://www.instagram.com/elizabeth_zolotova/" target="_blank" rel="noopener noreferrer" className="text-sm text-white/40 hover:text-[#E879F9] transition-colors">Instagram</a>
                <a href="https://www.youtube.com/@elizabeth_zolotova" target="_blank" rel="noopener noreferrer" className="text-sm text-white/40 hover:text-[#E879F9] transition-colors">YouTube</a>
                <a href="mailto:dance.with.elizabeth.zolotova@gmail.com" className="text-sm text-white/40 hover:text-[#E879F9] transition-colors">Contact Us</a>
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-8 text-center">
            <p className="text-xs text-white/25">&copy; 2026 High Heels Dance — Elizabeth Zolotova. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* ── Floating Chat ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 rounded-full w-12 h-12 sm:w-14 sm:h-14 shadow-lg hover:shadow-xl bg-[#C026D3] hover:bg-[#A21CAF] text-white flex items-center justify-center transition-all duration-300 hover:scale-105 z-[45]"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {showChat && (
        <div className="fixed bottom-24 right-3 left-3 sm:left-auto sm:right-6 sm:w-96 z-50">
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
