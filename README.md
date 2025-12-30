# Auto Glass Content Automation Platform

A comprehensive content automation platform for auto glass shops that transforms PAA (People Also Ask) questions into multi-channel content including blog posts, podcasts, videos, and social media posts.

## Features

- **Client Management**: Manage 15+ auto glass shop clients with WordPress integration
- **Content Pipeline**: Automated content generation from PAA questions
- **Multi-Channel Publishing**: Blog posts, podcasts, videos, and social media
- **Schema Markup**: Comprehensive LocalBusiness schema linking all content
- **Press Releases**: Monthly automated press release generation
- **Client Portal**: Read-only dashboard for clients to view their content 

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: Vercel Postgres (PostgreSQL) with Prisma ORM
- **Authentication**: NextAuth.js
- **Styling**: Tailwind CSS
- **File Storage**: Google Cloud Storage

## API Integrations

- **Claude API**: Blog post and content generation
- **Nano Banana Pro**: Image generation
- **AutoContent**: Podcast generation
- **Creatify**: Short video generation
- **getlate.dev**: Social media scheduling
- **WordPress REST API**: Blog publishing

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Vercel Postgres)
- API keys for all integrated services

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd auto-glass-platform

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push

# Seed initial data
npm run db:seed

# Start development server
npm run dev
```

### Environment Variables

See `.env.example` for required environment variables.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── admin/              # Admin dashboard pages
│   ├── api/                # API routes
│   ├── portal/             # Client portal
│   └── (auth)/             # Authentication pages
├── components/             # React components
│   ├── admin/              # Admin-specific components
│   ├── forms/              # Form components
│   └── ui/                 # UI primitives
├── lib/                    # Utilities and integrations
│   ├── integrations/       # Third-party API clients
│   └── pipeline/           # Content generation pipeline
└── types/                  # TypeScript types
```

## Content Pipeline Flow

1. **PAA Question Added** - Schedule publish date
2. **Generate Blog Post** - Claude API creates 800-1500 word article
3. **Generate Schema Markup** - LocalBusiness, BlogPosting, FAQPage schemas
4. **Generate Images** - Nano Banana creates all sizes for all platforms
5. **Publish to WordPress** - Upload featured image and content
6. **Generate Podcast** - AutoContent creates audio version
7. **Generate Video** - Creatify creates short-form video
8. **Schedule Social Posts** - getlate.dev schedules to all platforms

## Cron Jobs

- **Content Generation**: Every 15 minutes
- **Press Release Generation**: 1st of each month at 2 AM
- **Social Status Check**: Every 6 hours

## Admin Dashboard

- `/admin/dashboard` - Overview and stats
- `/admin/clients` - Client management
- `/admin/content` - Content calendar
- `/admin/press-releases` - Monthly press releases

## Client Portal

Each client has a read-only portal at `/portal/[client-slug]` to view their published content.

## Deployment

This project is designed for deployment on Vercel with Vercel Postgres.

```bash
vercel deploy
```

## License

Proprietary - Auto Glass Marketing Pros
