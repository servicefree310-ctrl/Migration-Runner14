import { db, usersTable } from "@workspace/db";

async function main() {
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    role: usersTable.role,
  }).from(usersTable).limit(30);
  console.log("Total users:", users.length);
  users.forEach(u => console.log(` id=${u.id} role=${u.role} email=${u.email}`));
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
