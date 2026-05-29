# Great. - Community-Backed Experience Platform

## 🎯 Overview

**Great.** is a full-stack web application for discovering and creating life-changing experiences such as retreats, workations, workshops, and adventure trips. The platform enables creators to build experiences with community-backed funding, while travelers can discover and book transformative journeys with confidence.

### Key Innovation: Community-Backed Funding (MVG System)

Unlike traditional booking platforms, Great. uses a **Minimum Viable Gathering (MVG)** funding model:
- Creators set minimum participant requirements
- Travelers book with payment authorization (not charged)
- Trip confirms only when minimum is reached
- Full automatic refund if minimum isn't met
- Venues accept soft-hold bookings during funding period

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (provided by Replit)
- Stripe account (for payments)
- OpenAI API key (for AI features)

### Installation

```bash
# Install dependencies
npm install

# Set up environment secrets (already configured in Replit)
# - OPENAI_API_KEY
# - STRIPE_WEBHOOK_SECRET

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:5000`

## 🏗️ Architecture

### Technology Stack

#### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query v5 for server state
- **UI Components**: Radix UI + shadcn/ui + Tailwind CSS
- **Forms**: React Hook Form with Zod validation
- **Icons**: Lucide React
- **Payments**: Stripe.js + React Stripe.js

#### Backend
- **Server**: Express.js with TypeScript
- **Database**: PostgreSQL (Neon serverless)
- **ORM**: Drizzle ORM with Drizzle Kit
- **Authentication**: Replit Auth + OpenID Connect
- **Session**: Express Session with PostgreSQL store
- **Payments**: Stripe SDK
- **AI**: OpenAI SDK
- **Object Storage**: Google Cloud Storage (S3-compatible)
- **Email**: SendGrid

#### Development
- **Build Tool**: Vite 5 for frontend
- **Bundler**: esbuild for backend
- **Language**: TypeScript with ES modules
- **Database Migrations**: Drizzle Kit (push-based)

### Project Structure

```
.
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components (routes)
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Utilities and helpers
│   └── index.html          # Entry HTML file
│
├── server/                 # Backend Express application
│   ├── routes.ts           # API routes and business logic
│   ├── storage.ts          # Database storage layer
│   ├── index.ts            # Server entry point
│   └── vite.ts             # Vite integration
│
├── shared/                 # Code shared between client & server
│   ├── schema.ts           # Database schema (Drizzle)
│   ├── pricingService.ts   # Revenue calculation logic
│   └── constants.ts        # Shared constants
│
└── db/                     # Database utilities
    └── seed.ts             # Database seeding script
```

## ✨ Core Features

### 1. **For Experience Creators**

#### Journey Builder (Event Builder)
- 10-step wizard for creating experiences
- AI-powered itinerary suggestions
- Rich media upload (S3-backed)
- Pricing calculator with multiple monetization models
- Role assignment and participant management
- Draft auto-save and progress tracking

#### Monetization Models
1. **Experience Facilitator**: Additive commission (base 20% + optional services up to 34%)
2. **Network Influencer**: Revenue share (default 25% to creator)
3. **Custom Model**: Flexible platform fee percentage

All models consistently handle Stripe fees (2.9% + $0.30) deducted from gross revenue.

#### Creator Dashboard
- Experience management (Draft → Pending → Approved → Published)
- Real-time booking analytics
- Earnings tracking with revenue breakdowns
- Participant list with role assignments
- MVG progress monitoring

### 2. **For Travelers**

#### Discovery & Booking
- Browse experiences by category (Retreats, Adventure, Workations, etc.)
- Detailed experience pages with full itineraries
- AI-powered search and recommendations
- Soft-hold reservation system (reserve without payment)
- Community-backed funding with refund protection

#### MVG (Minimum Viable Gathering) System
- **Deposit Option**: Pay deposit now, balance when confirmed
- **Full Payment Option**: Authorize full amount (not charged until confirmed)
- **Funding Progress**: Real-time progress bars and countdown timers
- **Automatic Refunds**: If minimum isn't met by deadline
- **Confirmation**: Trip confirms when minimum reached, payments captured

#### Community Features
- Pre-experience community building
- Participant profiles with skills and interests
- Group chat and messaging
- Role assignments (Chef, Photographer, etc.)
- Post-experience reviews

### 3. **For Venue Providers**

#### Venue Setup Wizard
- 10-step onboarding process matching Event Builder structure
- Calendar integration (Google Calendar ready)
- Room type configuration with capacity management
- Amenities and services catalog
- Pricing and commission settings
- Admin approval workflow

#### Availability Management
- **Manual Blocking**: Set unavailable dates directly
- **Soft-Hold Support**: Accept provisional bookings during funding
- **Google Calendar Sync**: Automatic availability updates (stub ready)
- **Booking Confirmation**: Receive deposit when trip confirms
- **Dashboard**: View all bookings, availability, and earnings

#### Key Features
- **Soft-Hold Days**: Configurable (e.g., 14-30 days)
- **Deposit Release**: Automatic when MVG threshold met
- **Commission Tracking**: Transparent revenue breakdown
- **Calendar View**: Admin can see all venue availability

### 4. **Platform-Wide Features**

#### Authentication & Roles
- **Replit Auth**: Seamless OpenID Connect integration
- **Role-Based Access**: Participant, Creator, Venue Provider, Service Provider, Admin
- **Role Switching**: Users can have multiple roles without re-authentication
- **Session Management**: Secure PostgreSQL-backed sessions

#### Payment Processing
- **Stripe Integration**: Secure payment handling
- **Payment Intents**: Hold authorization until confirmation
- **Escrow System**: Platform holds funds during MVG period
- **Automatic Captures**: Process payments when conditions met
- **Automatic Refunds**: Return funds if trip doesn't confirm

#### Admin Dashboard
- Experience approval workflow (Pending → Approved/Rejected)
- Venue approval workflow
- Preview tokens for stakeholder review
- User management
- Platform analytics

## 🎯 Three Key Functional Flows

### Flow 1: Creator → Trip Creation → Funding → Confirmation

1. **Create Account** → Login with Replit Auth
2. **Build Experience** → Use Journey Builder to design trip
   - Set details (name, category, dates, location)
   - Upload photos (S3-backed)
   - Create itinerary with time slots
   - Configure pricing and MVG settings (minimum participants, deadline)
   - Set roles and assign participants
3. **Submit for Review** → Admin approves experience
4. **Publish** → Experience goes live on platform
5. **Track Funding** → Monitor booking progress toward minimum
6. **Confirmation** → When minimum reached, trip confirms
7. **Earn** → Receive revenue after successful trip

### Flow 2: Traveler → Discovery → Booking → Funding → Trip

1. **Discover** → Browse experiences by category/search
2. **View Details** → See full itinerary, pricing, creator profile
3. **Check MVG Progress** → View funding progress bar
4. **Book Options**:
   - **Option A**: Book Now (pay deposit or authorize full amount)
   - **Option B**: Reserve Spot (soft-hold for 48 hours without payment)
5. **Payment** → Stripe checkout (deposit or full authorization)
6. **Wait for Confirmation** → Track progress toward minimum
7. **Trip Confirms** → Receive confirmation when minimum met (or refund if not)
8. **Community Building** → Connect with other participants before trip
9. **Experience Journey** → Attend the transformative experience
10. **Review** → Rate and review after completion

### Flow 3: Venue → Soft-Hold → Booking → Deposit Release

1. **List Venue** → Complete 10-step Venue Setup Wizard
   - Add venue details, photos, calendar
   - Configure rooms, amenities, services
   - Set pricing and commission
2. **Submit for Approval** → Admin reviews venue
3. **Set Availability** → Mark available dates on calendar
4. **Receive Soft-Hold** → Creator requests provisional booking
5. **Hold Dates** → Dates reserved while experience funds
6. **Monitor Funding** → Track MVG progress from venue dashboard
7. **Confirmation**:
   - **If Minimum Met**: Booking confirmed, deposit released
   - **If Not Met**: Dates released back to availability
8. **Host Experience** → Welcome participants to venue
9. **Get Paid** → Receive venue revenue after event

## 🔐 Security & Data Integrity

### Authentication
- Replit Auth with OpenID Connect
- Secure session management
- CSRF protection
- Role-based access control with backend enforcement

### Payments
- Stripe PCI compliance
- Secure payment intent flow
- No card data touches our servers
- Webhook signature verification

### Database
- PostgreSQL with Drizzle ORM
- Input validation with Zod schemas
- Parameterized queries (SQL injection protection)
- Soft deletes for important records

### File Uploads
- S3-backed object storage
- Pre-signed URLs for direct upload
- File type and size validation
- MIME type verification on server

## 📊 Database Schema

### Core Tables

#### Users
- Authentication and profile data
- Role assignments
- Profile completeness tracking

#### Experiences
- Full experience details (title, description, dates, location)
- Pricing and MVG settings
- Status tracking (draft, pending, approved, published)
- Creator relationship
- Itinerary data (JSONB)
- Participant counts and booking stats

#### Bookings
- Payment tracking (Stripe Payment Intent IDs)
- Deposit vs full payment handling
- MVG escrow status
- Confirmation states

#### Reservations
- Soft-hold system
- Expiration timestamps
- Conversion tracking to bookings

#### Venues
- Venue details and media
- Room types and capacity (JSONB)
- Amenities and services (JSONB arrays)
- Availability management
- Pricing and commission

#### Venue Availability
- Date-level availability tracking
- Source tracking (manual vs Google sync)
- Booking associations

### Key Relationships

```
Users → Experiences (creator)
Users → Bookings (traveler)
Users → Venues (owner)
Experiences → Bookings (many bookings per experience)
Experiences → Reservations (soft-holds)
Venues → VenueAvailability (calendar)
```

## 🧪 Testing

### Feature Testing

See `FEATURE_TESTING_VALIDATION.md` for comprehensive testing documentation covering:
- Amenities/services selection and custom additions
- Roles configuration and syncing
- Media upload flow (S3)
- Itinerary time slot management
- Pricing and payment logic
- Room configuration with dropdowns
- Navigation buttons and accessibility

### Running Tests

```bash
# Run test suite (if configured)
npm test

# Database push (development)
npm run db:push

# Database push (force, if data loss warning)
npm run db:push --force
```

## 🎨 Design System

### Colors
- **Primary**: Blue gradient (blue-600 → indigo-700 → purple-800)
- **Success**: Green-600 (confirmations, funding success)
- **Warning**: Yellow-600 (pending states, alerts)
- **Error**: Red-600 (failures, cancellations)
- **Neutral**: Gray scale for backgrounds and text

### Typography
- **Headings**: Bold, large (3xl-6xl)
- **Body**: Regular, readable (base-xl)
- **Small**: Captions and helper text (sm-xs)

### Components
- All components use shadcn/ui with Tailwind CSS
- Dark mode support throughout
- Consistent spacing and border radius
- Accessible (ARIA labels, keyboard navigation)

## 🚢 Deployment

### Replit Deployment (Recommended)

This project is configured for one-click deployment on Replit:

1. Ensure all environment secrets are set:
   - `OPENAI_API_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `DATABASE_URL` (auto-configured)

2. Click the "Publish" button in Replit

3. The app will be available at `https://your-repl-name.replit.app`

### Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret

Optional:
- `NODE_ENV` - Set to 'production' for production deployment
- `PORT` - Server port (default: 5000)

## 📝 API Documentation

### Key Endpoints

#### Experiences
- `GET /api/experiences` - List all approved experiences
- `GET /api/experiences/:id` - Get experience details
- `POST /api/experiences` - Create new experience (creator only)
- `PATCH /api/experiences/:id` - Update experience
- `POST /api/experiences/:id/submit` - Submit for admin approval

#### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings` - Get user's bookings
- `POST /api/create-payment-intent` - Initialize Stripe payment

#### Reservations (Soft-Hold)
- `POST /api/experiences/:id/reserve` - Create soft-hold reservation
- `POST /api/reservations/:id/convert` - Convert reservation to booking
- `DELETE /api/reservations/:id` - Cancel reservation
- `GET /api/reservations` - Get user's active reservations

#### MVG System
- `POST /api/mvg/check/:id` - Check MVG status and process
- `POST /api/mvg/check-deadlines` - Cron job to process all deadlines
- `GET /api/experiences/:id/booking-stats` - Get funding progress

#### Venues
- `POST /api/venues` - Create venue (provider only)
- `PATCH /api/venues/:id` - Update venue
- `POST /api/venues/:id/submit-for-review` - Submit for approval
- `POST /api/venues/:id/availability` - Add availability dates
- `DELETE /api/venues/:id/availability/:date` - Remove availability

#### Admin
- `GET /api/admin/pending-experiences` - List pending approvals
- `POST /api/admin/experiences/:id/approve` - Approve experience
- `POST /api/admin/experiences/:id/reject` - Reject experience
- `POST /api/admin/preview-token/:id` - Generate preview token

## 🤝 Contributing

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Follow TypeScript best practices
   - Use existing component patterns
   - Add proper error handling
   - Include data-testid attributes for testing

3. **Test Changes**
   - Test in development mode
   - Check LSP diagnostics
   - Verify responsive design
   - Test dark mode

4. **Database Changes**
   - Update `shared/schema.ts`
   - Run `npm run db:push`
   - Update storage interface if needed

5. **Commit**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

### Code Style

- Use TypeScript strict mode
- Follow existing patterns
- Use Tailwind CSS for styling
- Implement proper error handling
- Add ARIA labels for accessibility
- Use semantic HTML
- Keep components small and focused

## 🎥 Demo Guide

See `DEMO_SCRIPT.md` for a complete walkthrough of all features including:
- Creator flow: Building and publishing an experience
- Traveler flow: Discovering and booking with MVG
- Venue flow: Listing space and managing soft-holds
- Admin flow: Approving experiences and venues
- Payment flow: Stripe integration and escrow
- Community features: Pre-trip connections

## 📚 Additional Resources

- [Replit Docs](https://docs.replit.com/) - Platform documentation
- [Stripe Docs](https://stripe.com/docs) - Payment integration
- [Drizzle ORM](https://orm.drizzle.team/) - Database ORM
- [shadcn/ui](https://ui.shadcn.com/) - Component library
- [TanStack Query](https://tanstack.com/query/) - Data fetching

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Error
```bash
# Reset database connection
npm run db:push --force
```

#### Workflow Not Starting
```bash
# Check logs
npm run dev

# Restart Replit environment if needed
```

#### Payment Intent Creation Fails
- Verify `STRIPE_WEBHOOK_SECRET` is set correctly
- Check Stripe dashboard for API key validity
- Ensure webhook endpoint is configured

#### Upload Failures
- Verify Google Cloud Storage credentials
- Check file size (max 10MB)
- Validate file type (JPG, PNG, WEBP only)

## 📄 License

This project is proprietary and confidential.

## 🙏 Acknowledgments

Built with:
- React + TypeScript
- Express.js
- PostgreSQL + Drizzle ORM
- Stripe
- OpenAI
- Replit Platform

---

**Great.** - Turn dreams into adventures, together. 🌍✨
"smh-developer" 
"smh-developer" 
