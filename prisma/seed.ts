import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'matt@autoglassmarketingpros.com' },
    update: {},
    create: {
      email: 'matt@autoglassmarketingpros.com',
      password: hashedPassword,
      name: 'Matt Merlino',
      role: 'ADMIN',
    },
  })

  console.log('Created admin user:', admin.email)

  // Create sample client
  const client = await prisma.client.upsert({
    where: { slug: 'collision-auto-glass' },
    update: {},
    create: {
      slug: 'collision-auto-glass',
      businessName: 'Collision Auto Glass & Calibration',
      contactPerson: 'John Smith',
      phone: '(503) 555-0123',
      email: 'info@collisionautoglass.com',
      streetAddress: '123 Main St',
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      hasShopLocation: true,
      offersMobileService: true,
      hasAdasCalibration: true,
      serviceAreas: ['Portland', 'Beaverton', 'Lake Oswego', 'Tigard', 'Gresham'],
      primaryColor: '#1e40af',
      secondaryColor: '#3b82f6',
      accentColor: '#f59e0b',
      brandVoice: 'Professional, helpful, and knowledgeable. We emphasize our ADAS expertise and mobile service convenience.',
      ctaText: 'Get a Free Quote',
      preferredPublishTime: '09:00',
      timezone: 'America/Los_Angeles',
      postsPerWeek: 2,
      socialPlatforms: ['facebook', 'instagram', 'linkedin'],
      status: 'ACTIVE',
    },
  })

  console.log('Created sample client:', client.businessName)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
