const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding flatmate users...\n');

  const password = await bcrypt.hash('Test@1234', 12);

  const members = [
    { name: 'Aisha',  email: 'aisha@flatmates.test' },
    { name: 'Rohan',  email: 'rohan@flatmates.test' },
    { name: 'Priya',  email: 'priya@flatmates.test' },
    { name: 'Meera',  email: 'meera@flatmates.test' },
    { name: 'Dev',    email: 'dev@flatmates.test' },
    { name: 'Sam',    email: 'sam@flatmates.test' },
  ];

  // Create users
  const users = [];
  for (const m of members) {
    const user = await prisma.user.upsert({
      where: { email: m.email },
      update: { name: m.name },
      create: {
        name: m.name,
        email: m.email,
        password,
      },
    });
    users.push(user);
    console.log(`  ✅ ${user.name} (${user.email}) — id: ${user.id}`);
  }

  // Find the "Flatmates" group
  const group = await prisma.group.findFirst({
    where: { name: 'Flatmates' },
    include: { members: true },
  });

  if (!group) {
    console.log('\n⚠️  No "Flatmates" group found. Create it first, then re-run.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n📂 Found group: "${group.name}" (id: ${group.id})`);
  console.log(`   Existing members: ${group.members.length}`);

  // Add users to the group
  let added = 0;
  for (const user of users) {
    const existing = group.members.find(m => m.userId === user.id);
    if (existing) {
      console.log(`   ⏭️  ${user.name} already in group`);
      continue;
    }

    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: user.id,
        role: 'member',
      },
    });
    added++;
    console.log(`   ➕ Added ${user.name} to Flatmates`);
  }

  // Create a default trip for the group (needed for transactions)
  let trip = await prisma.trip.findFirst({
    where: { groupId: group.id },
  });

  if (!trip) {
    trip = await prisma.trip.create({
      data: {
        name: 'General',
        groupId: group.id,
        startDate: new Date('2025-02-01'),
      },
    });
    console.log(`\n🗓️  Created default trip: "${trip.name}" (id: ${trip.id})`);
  } else {
    console.log(`\n🗓️  Existing trip: "${trip.name}" (id: ${trip.id})`);
  }

  console.log(`\n✨ Done! ${added} new members added. Total: ${group.members.length + added + 1} (you + ${users.length} flatmates)`);
  console.log('\n👉 Now go to /import and upload expenses_export.csv!');

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
