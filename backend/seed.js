require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("./prismaClient");

const seedUsers = async () => {
  try {
    console.log("Connected to DB for seeding...");

    // Delete existing users
    await prisma.user.deleteMany({
      where: {
        OR: [
          { name: "admin" },
          { name: { startsWith: "entry" } },
          { name: { startsWith: "food" } },
        ],
      },
    });

    const salt = await bcrypt.genSalt(10);

    // Create Admin
    await prisma.user.create({
      data: {
        name: "admin",
        passwordHash: await bcrypt.hash("admin*123", salt),
        role: "ADMIN",
      },
    });

    console.log("- Admin created (admin / admin*123) [ADMIN]");

    // Create Entry Volunteers (entry1 to entry6)
    for (let i = 1; i <= 6; i++) {
      await prisma.user.create({
        data: {
          name: `entry${i}`,
          passwordHash: await bcrypt.hash(`entry${i}*123`, salt),
          role: "ENTRY_VOLUNTEER",
        },
      });

      console.log(
        `- Entry Volunteer created (entry${i} / entry${i}*123) [ENTRY_VOLUNTEER]`,
      );
    }

    // Create Food Volunteers (food1 to food6)
    for (let i = 1; i <= 6; i++) {
      await prisma.user.create({
        data: {
          name: `food${i}`,
          passwordHash: await bcrypt.hash(`food${i}*123`, salt),
          role: "FOOD_VOLUNTEER",
        },
      });

      console.log(
        `- Food Volunteer created (food${i} / food${i}*123) [FOOD_VOLUNTEER]`,
      );
    }

    console.log("Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

seedUsers();
