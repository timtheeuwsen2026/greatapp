# Great. - Experience Platform

## Overview

Great. is a full-stack web application designed for discovering and creating transformative experiences like retreats, workations, workshops, and adventure trips. It aims to be a comprehensive platform for users to find and create unique journeys, supported by an intelligent AI assistant for navigation and planning. The project focuses on fostering community and providing a complete travel ecosystem by integrating both platform-native and third-party travel options. The vision is to empower creators, provide diverse experiences, and offer intelligent assistance for seamless trip planning and booking.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application utilizes a modern full-stack architecture with distinct client and server components.

### UI/UX Decisions
- **Frontend Framework**: React with TypeScript.
- **Routing**: Wouter.
- **Component Library**: Radix UI primitives and shadcn/ui for UI components.
- **Styling**: Tailwind CSS.
- **State Management**: TanStack Query for server state.
- **Forms**: React Hook Form with Zod for validation.

### Technical Implementations
- **Backend**: Node.js with Express.js, TypeScript, and ES modules.
- **Database**: PostgreSQL (Neon Database for serverless hosting) with Drizzle ORM.
- **Authentication**: Replit Auth with OpenID Connect, featuring robust role-based access control allowing seamless switching between participant, creator, venue, and service provider roles.
- **Payment Processing**: Stripe integration supporting various creator monetization models (Experience Facilitator, Network Influencer, Custom) with unified pricing calculation logic and consistent Stripe fee handling. A shared pricing service ensures calculation consistency across client and server.
- **Experience Management**: Comprehensive system for creating, categorizing, and managing experiences, including admin approval workflows, rich media support, and a 10-step Event Builder wizard with automatic capacity calculation and MVG (Minimum Viable Group) configuration.
- **Status-Based Access Control**: Three-tier access system (Draft, Pending, Approved) with secure preview tokens and backend-enforced authorization.
- **Profile Systems**: Detailed profiles for participants, creators, venue providers, and service providers.
- **Venue Management**: Availability tracking with manual blocking and a Google Calendar integration stub, managed through a 10-step Venue Setup Wizard.
- **Shared Roles System**: Centralized list of 21 standard roles usable in both Venue and Event Builders, with support for custom roles and an enhanced `RolesEditor` component for detailed configuration.
- **AI-Powered Assistant**: Utilizes OpenAI for natural language processing, providing conversational navigation, intent detection, and dynamic action buttons.
- **Platform-First Travel Ecosystem**: Prioritizes platform experiences while intelligently integrating third-party travel options.
- **Social-First Discovery System**: Features for community building, social discovery, messaging, and participant interaction.
- **Photo Upload System**: S3-backed photo uploads using Replit's Object Storage integration, supporting drag-and-drop, progress tracking, and validation.
- **Auto-Save System**: Debounced auto-saving for forms in the Event Builder.
- **MVG (Minimum Viable Group) Automation**: Automated, community-backed funding system with refundable Stripe deposits, auto-confirmation upon reaching the MVG threshold, and auto-cancellation with refunds if the MVG is not met by the deadline. Includes real-time WebSocket updates, comprehensive notifications, and capacity protection.
- **Promoter Attribution System**: Multi-role support with referral tracking via `promoter_code` URL parameters, client-side attribution storage, and server-side persistence for logged-in users.
- **Commission Calculation & Lifecycle**: Automated promoter commission tracking integrated with the MVG lifecycle, supporting platform-wide and per-experience overrides for commission modes (percent/fixed) and basis (per_spot/per_booking). Commissions are calculated on full price and tracked through `estimated`, `locked`, and `voided` statuses.
- **Recruit Your Squad (Step 5 Viral Loop)**: Post-deposit viral growth screen at `/recruit`. When a user pays a deposit, they are automatically redirected to this screen (instead of the plain booking-success page). The screen auto-generates a personal referral link using the existing promoter/commission system (`POST /api/me/ensure-referral-code`). Includes WhatsApp, SMS/iMessage, and native share buttons. When friends book via the referral link, commission is attributed to the depositor as event credit. A "Continue to my booking" button proceeds to the standard booking-success page. Full checkout → recruit → booking-success flow is tested and working.
- **MVG Cancellation/Refund Hardening (Step 6)**: Full audit and hardening of MVG lifecycle. `getEligibleBookingsForRefund()` and `getEligibleDepositsForCapture()` both updated to include `pending` status (normal checkout creates `pending` bookings, not `deposit_authorized`). `getMVGProgress()` updated to include `pending` status and guards against cancelled bookings. MVG scheduler runs `processMVGDeadlines()` and orphan cleanup immediately on startup (not just on cron). `cleanupOrphanedPendingBookings()` function handles any bookings that were missed before the fix. `booking-success.tsx` shows a clear cancelled/refunded UI with XCircle icon, refund timeline info, and navigation buttons when booking or experience status is `cancelled`. Cancelled experiences are now publicly accessible via the API (needed so participants can view their booking status).
- **Lifecycle Visual Overlays (Step 8)**: Dynamic image overlays on experience cards and detail hero images driven by backend `lifecycleStatus`. FORMING state shows an orange "🔥 HELP US MAKE IT HAPPEN" gradient overlay with live progress bar and spots-remaining copy. CONFIRMED state shows a green banner with checkmark. CANCELLED state applies grayscale + opacity filter to the image with a muted overlay badge. Hero video container added to homepage — `<video autoPlay muted loop playsInline>` pointing to `/assets/hero-video.mp4` with gradient overlay as fallback/contrast layer (works gracefully whether or not the video file is present).
- **Clickable Community Profiles**: Participant avatars on experience cards (via `RealParticipantAvatars`) and tribe member cards on the community page are now clickable, navigating to `/community/profile/:userId`. A new public community profile page shows avatar, display name (first name + last initial for privacy), location, bio, interests/skills tags, and a grid of trips they've joined. Activity feed avatars with known userIds are also clickable. Test/QA/anonymous accounts are filtered from all community surfaces. Backend: `GET /api/community/profile/:userId` returns privacy-safe profile data including derived interest tags from booking categories.
- **Story Card Download (Step 8)**: Recruit-squad page now has a "Download Story Card (9:16)" button. Uses the Canvas API to generate a 540×960 PNG with: experience cover image (CORS-safe, falls back to gradient), "Great." wordmark watermark, experience title (auto-wrapped), referral link, and brand footer. Downloads directly to device — perfect for Instagram/WhatsApp Stories sharing.
- **Human Gap Copy (Final Sweep)**: All percentage labels on FORMING experiences removed platform-wide. Replaced with emotional human gap formats: "🔥 Just X more travelers to make this real!" (1-3 needed), "⚡ X more travelers needed to confirm this trip!" (4-6), "👥 X more travelers needed to make this happen!" (7+). Affects experience-card.tsx (forming overlay + MVG widget), FundingProgressBar.tsx, JoinTripModal.tsx. Progress bars remain as visual elements only.
- **Clickable Avatars (Final Sweep)**: All participant avatar surfaces on experience detail pages are now clickable and navigate to `/community/profile/:userId`. Updated components: `ParticipantAvatars` (avatar stack, added userId to interface + click handler), `ParticipantList` (grid items, added onClick navigation), `SocialProofGallery` (hero social proof section, added userId to API response + click handlers). Backend `getExperienceSocialProof()` now returns `userId` per participant.
- **APP_BASE_URL Configuration (Final Sweep)**: Single `APP_BASE_URL` environment variable controls the branded base URL across all sharing surfaces. Defaults to `https://greatapp.ai`. Server-side: `ensure-referral-code` endpoint and `og.ts` (og:url) both use `process.env.APP_BASE_URL`. Client-side: ShareKitModal, recruit-squad story card, promoter.tsx, and promoter-experience-pool.tsx all use `import.meta.env.VITE_APP_BASE_URL || 'https://greatapp.ai'` as the base for all referral links. OG image URL still uses the actual server domain (REPLIT_DOMAINS) to ensure crawlers can fetch it.

### System Design Choices
- **Development Tools**: Vite for frontend bundling, esbuild for backend.
- **Database Schema**: Structured PostgreSQL schema encompassing Users, Experiences, Bookings, Reviews, and various profiles.
- **Deployment Target**: Replit.

## External Dependencies

- **Authentication**: Replit Auth, OpenID Client.
- **Payment Processing**: Stripe, @stripe/stripe-js, @stripe/react-stripe-js.
- **Database**: Neon Database (PostgreSQL), Drizzle ORM, connect-pg-simple.
- **AI/NLP**: OpenAI.
- **UI/UX**: Radix UI, Tailwind CSS, Lucide React.
- **Object Storage**: Google Cloud Storage (via Replit Object Storage integration), @google-cloud/storage.
- **Email Notifications**: SendGrid (@sendgrid/mail) for transactional emails, with API key, from email (e.g., Tim@greatapp.ai), and optional from name configured via environment variables. Includes idempotent tracking and retry logic.