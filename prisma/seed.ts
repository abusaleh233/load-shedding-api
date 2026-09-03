import { PrismaClient, Role, SubstationStatus } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Keep this in sync with BCRYPT_SALT_ROUNDS in .env — seeding runs standalone
// (via ts-node, not the app), so it doesn't read src/config/env.ts.
const SALT_ROUNDS = 12;

interface DemoUser {
  name: string;
  email: string;
  password: string;
  role: Role;
}

const DEMO_USERS: DemoUser[] = [
  { name: "System Administrator", email: "admin123@gmail.com", password: "Admin123!", role: Role.ADMIN },
  { name: "Grid Operator", email: "operator123@gmail.com", password: "Operator123!", role: Role.OPERATOR },
  { name: "Demo Consumer", email: "consumer123@gmail.com", password: "Consumer123!", role: Role.CONSUMER },
];

interface DemoArea {
  name: string;
  feederCode: string;
}

interface DemoSubstation {
  name: string;
  code: string;
  location: string;
  capacityMW: number;
  status: SubstationStatus;
  areas: DemoArea[];
}

const DEMO_SUBSTATIONS: DemoSubstation[] = [
  {
    name: "Dhaka Central Substation",
    code: "SS-DHK-001",
    location: "Dhaka, Bangladesh",
    capacityMW: 150.5,
    status: SubstationStatus.ACTIVE,
    areas: [
      { name: "Gulshan Feeder Zone", feederCode: "FDR-GLSN-01" },
      { name: "Dhanmondi Feeder Zone", feederCode: "FDR-DHMD-01" },
    ],
  },
  {
    name: "Chattogram North Substation",
    code: "SS-CTG-001",
    location: "Chattogram, Bangladesh",
    capacityMW: 120.0,
    status: SubstationStatus.ACTIVE,
    areas: [
      { name: "Agrabad Feeder Zone", feederCode: "FDR-AGRB-01" },
      { name: "Pahartali Feeder Zone", feederCode: "FDR-PHRT-01" },
    ],
  },
  {
    name: "Sylhet Grid Substation",
    code: "SS-SYL-001",
    location: "Sylhet, Bangladesh",
    capacityMW: 85.0,
    status: SubstationStatus.MAINTENANCE,
    areas: [
      { name: "Zindabazar Feeder Zone", feederCode: "FDR-ZNDB-01" },
      { name: "Ambarkhana Feeder Zone", feederCode: "FDR-AMBK-01" },
    ],
  },
];

async function seedUsers() {
  for (const demo of DEMO_USERS) {
    const password = await bcrypt.hash(demo.password, SALT_ROUNDS);
    await prisma.user.upsert({
      where: { email: demo.email },
      update: {}, // don't clobber a user that already exists / has been modified
      create: {
        name: demo.name,
        email: demo.email,
        password,
        role: demo.role,
        isVerified: true,
      },
    });
    console.log(`  ✓ User ready: ${demo.email} [${demo.role}]`);
  }
}

async function seedSubstationsAndAreas() {
  for (const demo of DEMO_SUBSTATIONS) {
    const substation = await prisma.substation.upsert({
      where: { code: demo.code },
      update: {},
      create: {
        name: demo.name,
        code: demo.code,
        location: demo.location,
        capacityMW: demo.capacityMW,
        status: demo.status,
      },
    });
    console.log(`  ✓ Substation ready: ${substation.name} (${substation.code})`);

    for (const area of demo.areas) {
      await prisma.area.upsert({
        where: { feederCode: area.feederCode },
        update: {},
        create: {
          name: area.name,
          feederCode: area.feederCode,
          substationId: substation.id,
        },
      });
      console.log(`    ↳ Area ready: ${area.name} (${area.feederCode})`);
    }
  }
}

async function main() {
  console.log("Seeding demo users...");
  await seedUsers();

  console.log("\nSeeding substations & areas...");
  await seedSubstationsAndAreas();

  console.log("\n✅ Seed complete. Demo credentials:");
  console.table(
    DEMO_USERS.map((u) => ({ role: u.role, email: u.email, password: u.password }))
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
