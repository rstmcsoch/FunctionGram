import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";

type FunctionGramDatabase = Record<string, Record<string, unknown>>;

let db: Kysely<FunctionGramDatabase> | undefined;

export function getTursoDb(): Kysely<FunctionGramDatabase> {
  if (db) return db;

    const url = process.env.TURSO_DATABASE_URL;
      const authToken = process.env.TURSO_AUTH_TOKEN;

        if (!url) {
            throw new Error("Missing TURSO_DATABASE_URL");
              }

                db = new Kysely<FunctionGramDatabase>({
                    dialect: new LibsqlDialect({
                          url,
                                authToken,
                                    }),
                                      });

                                        return db;
                                        }