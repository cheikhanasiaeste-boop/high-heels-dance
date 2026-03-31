import { useAuth } from '@/_core/hooks/useAuth';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, ArrowLeft } from 'lucide-react';

export default function Messages() {
  const { user } = useAuth();

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
          <h1 className="text-2xl font-bold text-white">My Messages</h1>
        </div>
      </header>

      {/* Content */}
      <div className="container py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/15 rounded-lg">
                <MessageSquare className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <CardTitle>Messages</CardTitle>
                <CardDescription>
                  View and manage your conversations
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-full mb-4">
                <MessageSquare className="w-8 h-8 text-white/50" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                No messages yet
              </h3>
              <p className="text-white/70 mb-6">
                Your conversations will appear here when you receive messages.
              </p>
              <Link href="/">
                <Button>Browse Courses</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
