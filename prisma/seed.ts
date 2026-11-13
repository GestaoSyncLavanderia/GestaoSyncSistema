import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Remove usuário legado se existir
  await db.user.deleteMany({ where: { email: "admin@dashboard.com" } });

  const hash = await bcrypt.hash("adm#sync", 12);

  await db.user.upsert({
    where: { email: "Administrador" },
    update: { password: hash, name: "Administrador" },
    create: {
      email: "Administrador",
      password: hash,
      name: "Administrador",
      role: "admin",
    },
  });

  console.log("✓ Usuário atualizado: Administrador / adm#sync");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
