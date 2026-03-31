import { useAuth } from '@/_core/hooks/useAuth';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, ArrowLeft, Clock, MapPin, Video, ArrowRight, Filter } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function MyBookings() {
  const { user } = useAuth();
  const { data: bookings, isLoading } = trpc.bookings.myBookings.useQuery();
  
  // Date filter state
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'upcoming' | 'past' | 'custom'>('upcoming');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Helper function to determine session state
  const getSessionState = (booking: any) => {
    if (booking.status === 'cancelled') return 'cancelled';
    
    const now = new Date();
    const sessionStart = new Date(booking.slot!.startTime);
    const sessionEnd = new Date(booking.slot!.endTime);
    const joinWindowStart = new Date(sessionStart.getTime() - 15 * 60 * 1000); // 15 min before
    
    if (now > sessionEnd) return 'completed';
    if (now >= joinWindowStart && now <= sessionEnd) return 'live';
    return 'upcoming';
  };

  // Helper function to get badge variant based on state
  const getStateBadgeVariant = (state: string) => {
    switch (state) {
      case 'live':
        return 'default'; // Green
      case 'upcoming':
        return 'secondary'; // Blue
      case 'completed':
        return 'outline'; // Gray
      case 'cancelled':
        return 'destructive'; // Red
      default:
        return 'secondary';
    }
  };

  // Helper function to get badge color classes
  const getStateBadgeClass = (state: string) => {
    switch (state) {
      case 'live':
        return 'bg-green-500/15 text-green-400 border-green-500/30 animate-pulse';
      case 'upcoming':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'completed':
        return 'bg-white/10 text-white/70 border-white/10';
      case 'cancelled':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      default:
        return 'bg-white/10 text-white/70 border-white/10';
    }
  };
  
  // Filter bookings by date
  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return bookings.filter((booking: any) => {
      const sessionStart = new Date(booking.slot!.startTime);
      
      switch (dateFilter) {
        case 'today':
          const sessionDate = new Date(sessionStart.getFullYear(), sessionStart.getMonth(), sessionStart.getDate());
          return sessionDate.getTime() === today.getTime();
        
        case 'upcoming':
          return sessionStart > now;
        
        case 'past':
          return sessionStart < now;
        
        case 'custom':
          if (!customStartDate || !customEndDate) return true;
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999); // Include entire end date
          return sessionStart >= start && sessionStart <= end;
        
        case 'all':
        default:
          return true;
      }
    });
  }, [bookings, dateFilter, customStartDate, customEndDate]);

  return (
    <div className="min-h-screen bg-[#0d0010]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#141118] sticky top-0 z-50">
        <div className="container py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-white">My Sessions</h1>
        </div>
      </header>

      {/* Content */}
      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Calendar Filter */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-purple-600" />
                  <CardTitle className="text-lg">Filter Sessions</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Date Filter Dropdown */}
                <div className="space-y-2">
                  <Label htmlFor="date-filter" className="text-sm font-medium">
                    Date Range
                  </Label>
                  <Select value={dateFilter} onValueChange={(value: any) => setDateFilter(value)}>
                    <SelectTrigger id="date-filter">
                      <SelectValue placeholder="Select date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sessions</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="past">Past</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Custom Date Range Inputs */}
                {dateFilter === 'custom' && (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <div className="space-y-2">
                      <Label htmlFor="start-date" className="text-sm">
                        Start Date
                      </Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end-date" className="text-sm">
                        End Date
                      </Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                
                {/* Filter Summary */}
                <div className="pt-3 border-t border-white/10">
                  <p className="text-sm text-white/70">
                    Showing <span className="font-semibold text-purple-600">{filteredBookings.length}</span> of <span className="font-semibold">{bookings?.length || 0}</span> sessions
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Right Main Area - Sessions List */}
          <div className="lg:col-span-3">
            <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/15 rounded-lg">
                <Calendar className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <CardTitle>Upcoming Sessions</CardTitle>
                <CardDescription>
                  View and manage your booked dance sessions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-white/70">Loading your bookings...</p>
              </div>
            ) : filteredBookings && filteredBookings.length > 0 ? (
              <div className="space-y-4">
                {filteredBookings.map((booking: any) => {
                  const sessionState = getSessionState(booking);
                  const isJoinable = sessionState === 'live' && booking.slot?.eventType === 'online' && booking.slot?.meetLink;
                  
                  return (
                    <Link key={booking.id} href={`/session/${booking.id}`}>
                      <Card className="cursor-pointer hover:shadow-lg hover:border-purple-300 transition-all duration-200 hover:-translate-y-0.5">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <CardTitle className="text-xl">
                                  {booking.slot?.title || `${booking.sessionType} Session`}
                                </CardTitle>
                                <Badge 
                                  className={getStateBadgeClass(sessionState)}
                                  variant="outline"
                                >
                                  {sessionState === 'live' && '🟢 '}
                                  {sessionState.charAt(0).toUpperCase() + sessionState.slice(1)}
                                </Badge>
                                <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>
                                  {booking.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Date & Time */}
                          <div className="flex items-center gap-2 text-sm text-white/70">
                            <Clock className="w-4 h-4 text-purple-600" />
                            <span className="font-medium">
                              {new Date(booking.slot!.startTime).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}{' '}
                              at{' '}
                              {new Date(booking.slot!.startTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {/* Session Type */}
                          {booking.slot?.eventType === 'online' ? (
                            <div className="flex items-center gap-2 text-sm text-white/70">
                              <Video className="w-4 h-4 text-purple-600" />
                              <span className="font-medium">🌐 Online Session</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-white/70">
                              <MapPin className="w-4 h-4 text-purple-600" />
                              <span className="font-medium">📍 {booking.slot?.location || 'In-person Session'}</span>
                            </div>
                          )}

                          {/* Description */}
                          {booking.slot?.description && (
                            <div className="pt-2 border-t border-white/10">
                              <p className="text-sm text-white/70 leading-relaxed line-clamp-2">
                                {booking.slot.description}
                              </p>
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="pt-0 flex justify-between items-center">
                          <Button variant="outline" size="sm" className="gap-2">
                            View Session Details
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                          {isJoinable && (
                            <Badge className="bg-green-600 text-white hover:bg-green-700 px-3 py-1 animate-pulse">
                              ✨ Ready to Join
                            </Badge>
                          )}
                        </CardFooter>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : bookings && bookings.length > 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-full mb-4">
                  <Calendar className="w-8 h-8 text-white/50" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  No sessions match your filter
                </h3>
                <p className="text-white/70 mb-4">
                  Try adjusting your date filter to see more sessions.
                </p>
                <Button variant="outline" onClick={() => setDateFilter('all')}>
                  Show All Sessions
                </Button>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-full mb-4">
                  <Calendar className="w-8 h-8 text-white/50" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  No bookings yet
                </h3>
                <p className="text-white/70 mb-6">
                  Book your first dance session to get started on your journey!
                </p>
                <Link href="/book-session">
                  <Button>Book a Session</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
