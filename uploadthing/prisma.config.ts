// Prisma configuration for Deno
// To use environment variables, create a .env file or set them in your environment

export default {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: "file:./exam.db",
  },
};
