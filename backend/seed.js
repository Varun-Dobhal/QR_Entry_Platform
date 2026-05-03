require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./prismaClient');

const seedUsers = async () => {
  try {
    console.log('Connected to DB for seeding...');

    // Delete existing standard users 
    await prisma.user.deleteMany({
      where: {
        name: { in: ['admin', 'entry', 'food'] }
      }
    });

    const salt = await bcrypt.genSalt(10);
    
    await prisma.user.create({
      data: {
        name: 'admin',
        passwordHash: await bcrypt.hash('admin123', salt),
        role: 'ADMIN'
      }
    });

    await prisma.user.create({
      data: {
        name: 'entry',
        passwordHash: await bcrypt.hash('entry123', salt),
        role: 'ENTRY_VOLUNTEER'
      }
    });

    await prisma.user.create({
      data: {
        name: 'food',
        passwordHash: await bcrypt.hash('food123', salt),
        role: 'FOOD_VOLUNTEER'
      }
    });

    console.log('Successfully created:');
    console.log('- Admin (admin / admin123) [ADMIN]');
    console.log('- Entry Volunteer (entry / entry123) [ENTRY_VOLUNTEER]');
    console.log('- Food Volunteer (food / food123) [FOOD_VOLUNTEER]');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

seedUsers();
