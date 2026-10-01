import { getMigrations } from "better-auth/db/migration";
import { getAuth } from "../lib/auth";

const auth = await getAuth();

const {
  toBeCreated,
    toBeAdded,
      runMigrations,
      } = await getMigrations(auth.options);

      console.log("Better Auth tables to create:");
      console.log(toBeCreated);

      console.log("Better Auth columns to add:");
      console.log(toBeAdded);

      await runMigrations();

      console.log("Better Auth migration completed successfully.");