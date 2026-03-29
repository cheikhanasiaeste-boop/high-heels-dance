import { describe, it, expect, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

type AuthenticatedUser = NonNullable<TrpcContext['user']>;

function createTestContext() {
  const adminUser: AuthenticatedUser = {
    id: 1,
    supabaseId: "00000000-0000-0000-0000-000000000001",
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    hasSeenWelcome: true,
    membershipStatus: "free",
    membershipStartDate: null,
    membershipEndDate: null,
    stripeSubscriptionId: null,
    lastViewedByAdmin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const adminCtx: TrpcContext = {
    user: adminUser,
    req: {} as any,
    res: {} as any,
  };

  const guestCtx: TrpcContext = {
    user: null,
    req: {} as any,
    res: {} as any,
  };

  return {
    adminCaller: appRouter.createCaller(adminCtx),
    guestCaller: appRouter.createCaller(guestCtx),
  };
}

describe('Top Pick Feature', () => {
  let adminCaller: any;
  let guestCaller: any;

  beforeEach(() => {
    const { adminCaller: ac, guestCaller: gc } = createTestContext();
    adminCaller = ac;
    guestCaller = gc;
  });

  it('should create course with isTopPick field', async () => {
    const course = await adminCaller.admin.courses.create({
      title: 'Top Pick Course',
      description: 'This is a top pick course',
      price: '99.00',
      isFree: false,
      isPublished: true,
    });

    expect(course).toBeDefined();
    expect(course.title).toBe('Top Pick Course');
    expect(course.isTopPick).toBe(false); // Default value
  });

  it('should update course to mark as top pick', async () => {
    // Create a course
    const course = await adminCaller.admin.courses.create({
      title: 'Regular Course',
      description: 'This will become a top pick',
      price: '79.00',
      isFree: false,
      isPublished: true,
    });

    // Update to mark as top pick
    const updated = await adminCaller.admin.courses.update({
      id: course.id,
      isTopPick: true,
    });

    expect(updated.isTopPick).toBe(true);
  });

  it('should list courses with isTopPick field', async () => {
    // Create multiple courses
    await adminCaller.admin.courses.create({
      title: 'Top Pick 1',
      description: 'First top pick',
      price: '99.00',
      isFree: false,
      isPublished: true,
    });

    const topPickCourse = await adminCaller.admin.courses.create({
      title: 'Top Pick 2',
      description: 'Second top pick',
      price: '89.00',
      isFree: false,
      isPublished: true,
    });

    // Mark second course as top pick
    await adminCaller.admin.courses.update({
      id: topPickCourse.id,
      isTopPick: true,
    });

    // List all courses
    const courses = await adminCaller.admin.courses.list();
    
    expect(courses.length).toBeGreaterThanOrEqual(2);
    
    const topPick = courses.find((c: any) => c.id === topPickCourse.id);
    expect(topPick).toBeDefined();
    expect(topPick.isTopPick).toBe(true);
  });

  it('should allow guests to see isTopPick field in public course list', async () => {
    // Create a top pick course
    const course = await adminCaller.admin.courses.create({
      title: 'Public Top Pick',
      description: 'This is visible to guests',
      price: '0.00',
      isFree: true,
      isPublished: true,
    });

    await adminCaller.admin.courses.update({
      id: course.id,
      isTopPick: true,
    });

    // Guest should be able to see it
    const publicCourses = await guestCaller.courses.list();
    const topPick = publicCourses.find((c: any) => c.id === course.id);
    
    expect(topPick).toBeDefined();
    expect(topPick.isTopPick).toBe(true);
  });

  it('should toggle top pick status', async () => {
    // Create course
    const course = await adminCaller.admin.courses.create({
      title: 'Toggle Test',
      description: 'Testing toggle functionality',
      price: '49.00',
      isFree: false,
      isPublished: true,
    });

    // Mark as top pick
    let updated = await adminCaller.admin.courses.update({
      id: course.id,
      isTopPick: true,
    });
    expect(updated.isTopPick).toBe(true);

    // Unmark as top pick
    updated = await adminCaller.admin.courses.update({
      id: course.id,
      isTopPick: false,
    });
    expect(updated.isTopPick).toBe(false);
  });
});
