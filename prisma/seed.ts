import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create admin user
  const hashedPassword = await bcrypt.hash('sandid0g', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'matt.lubbes@gmail.com' },
    update: {
      password: hashedPassword,
      name: 'Matt Lubbes',
    },
    create: {
      email: 'matt.lubbes@gmail.com',
      password: hashedPassword,
      name: 'Matt Lubbes',
      role: 'ADMIN',
    },
  })

  console.log('Created admin user:', admin.email)

  // No sample client: clients are created through the admin UI. The old sample
  // used a slug that doesn't exist in production and would have created a
  // duplicate, wrong client if run against a real database.
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
