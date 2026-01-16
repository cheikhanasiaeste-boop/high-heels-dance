# High Heels Dance Platform - TODO

## Database & Schema
- [x] Design courses table with support for free/paid courses
- [x] Design purchases table to track user course access
- [x] Design site settings table for discount banner configuration
- [x] Design chat messages table for AI support history
- [x] Push database schema migrations

## Backend API (tRPC)
- [x] Create course listing procedure (public access)
- [x] Create course detail procedure with access control
- [x] Create admin procedures for course CRUD operations
- [x] Create purchase procedure with Stripe integration
- [x] Create user course access verification procedure
- [x] Create admin procedures for banner management
- [x] Create AI chat procedure with LLM integration
- [x] Add admin-only middleware for protected routes

## Frontend - Public Pages
- [x] Design and implement home page with profile section
- [x] Create course card component with image, title, description, price
- [x] Implement course listing grid layout
- [x] Create course detail page with purchase flow
- [x] Add social media links section
- [x] Implement discount popup banner (conditional display)

## Frontend - Authentication
- [x] Implement email login flow
- [x] Add social media login (Google, Facebook) via Manus OAuth
- [x] Create user account page
- [x] Add logout functionality

## Frontend - Admin Dashboard
- [x] Create admin dashboard layout with navigation
- [x] Build course management interface (add/edit/delete)
- [x] Implement image upload for courses
- [x] Create banner management toggle interface
- [x] Add course preview functionality

## Payment Integration
- [x] Set up Stripe integration
- [x] Create checkout flow for course purchases
- [x] Implement payment success/failure handling
- [x] Add purchased courses to user account

## AI Chat Support
- [x] Implement chat UI component
- [x] Integrate LLM for customer support responses
- [x] Add chat history persistence
- [x] Configure chatbot knowledge about courses and policies

## Styling & Design
- [x] Configure pink/lavender color scheme in Tailwind
- [x] Apply modern, clean design aesthetic
- [x] Ensure responsive design for mobile
- [x] Add animations and transitions

## Testing & Deployment
- [x] Write vitest tests for critical procedures
- [x] Test all user flows (browse, purchase, access)
- [x] Test admin flows (course management, banner toggle)
- [x] Create deployment checkpoint

## Calendar Booking System
- [x] Design availability slots table in database
- [x] Design bookings table with user and session details
- [x] Create API endpoints for viewing availability
- [x] Create API endpoints for booking sessions
- [x] Build calendar UI component
- [x] Implement booking form with date/time selection
- [x] Add Zoom meeting link generation
- [x] Create admin panel for managing availability
- [x] Add booking management for admin (view/cancel)
- [ ] Implement email notifications for bookings
- [x] Add booking confirmation page
- [x] Test complete booking flow
