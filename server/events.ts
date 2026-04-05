import { EventEmitter } from 'events';

export interface AdminNotification {
  type: 'booking' | 'registration' | 'purchase' | 'testimonial' | 'store_order' | 'stock_issue';
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
  emitStoreOrder(order: any) {
    const notification: AdminNotification = {
      type: 'store_order',
      title: 'New Store Order',
      message: `Order #${order.id} — €${order.total} from ${order.email}`,
      timestamp: Date.now(),
      data: order,
    };
    this.emit('notification', notification);
  }

  emitStockIssue(orderId: number, variantKey: string, stock: number) {
    const notification: AdminNotification = {
      type: 'stock_issue',
      title: 'Stock Issue',
      message: `Order #${orderId}: ${variantKey} went to stock=${stock}`,
      timestamp: Date.now(),
      data: { orderId, variantKey, stock },
    };
    this.emit('notification', notification);
  }
}

export const adminNotifications = new AdminNotificationEmitter();
