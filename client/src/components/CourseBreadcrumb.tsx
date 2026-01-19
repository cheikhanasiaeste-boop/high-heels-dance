import { Link } from 'wouter';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Home } from 'lucide-react';

interface CourseBreadcrumbProps {
  courseName?: string;
  courseId?: number;
  lessonTitle?: string;
  className?: string;
}

export function CourseBreadcrumb({
  courseName,
  courseId,
  lessonTitle,
  className,
}: CourseBreadcrumbProps) {
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {/* Home */}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />

        {/* Courses */}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/courses">Courses</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {/* Course Name (if provided) */}
        {courseName && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {lessonTitle && courseId ? (
                // If we have a lesson, make course name clickable
                <BreadcrumbLink asChild>
                  <Link href={`/courses/${courseId}`}>{courseName}</Link>
                </BreadcrumbLink>
              ) : (
                // If no lesson, course name is the current page
                <BreadcrumbPage>{courseName}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        )}

        {/* Lesson Title (if provided) */}
        {lessonTitle && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{lessonTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
