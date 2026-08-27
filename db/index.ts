import { drizzle } from "drizzle-orm/neon-http";

import { resolveDatabaseUrl } from "@/lib/database-url";

export const db = drizzle(resolveDatabaseUrl());
