import { EventEmitter } from 'events';

export interface AdminNotification {
  type: 'booking' | 'registration' | 'purchase' | 'testimonial';
  title: string;
  message: string;
  timestamp: number;
  data?: any;
}

class AdminNotificationEmitter extends EventEmitter {
  emitBooking(booking: any) {
    const notification: AdminNotification = {
      type: 'booking',
      title: 'New Booking',
      message: `New ${booking.sessionType} booking received`,
      timestamp: Date.now(),
      data: booking,
    };
    this.emit('notification', notification);
  }

  emitRegistration(user: any) {
    const notification: AdminNotification = {
      type: 'registration',
      title: 'New User Registration',
      message: `${user.name || user.email} just registered`,
      timestamp: Date.now(),
      data: user,
    };
    this.emit('notification', notification);
  }

  emitPurchase(purchase: any, courseName: string) {
    const notification: AdminNotification = {
      type: 'purchase',
      title: 'New Course Purchase',
      message: `Course "${courseName}" was purchased`,
      timestamp: Date.now(),
      data: purchase,
    };
    this.emit('notification', notification);
  }

  emitTestimonial(testimonial: any) {
    const notification: AdminNotification = {
      type: 'testimonial',
      title: 'New Testimonial',
      message: `${testimonial.userName} submitted a testimonial`,
      timestamp: Date.now(),
      data: testimonial,
    };
    this.emit('notification', notification);
  }
}

export const adminNotifications = new AdminNotificationEmitter();
