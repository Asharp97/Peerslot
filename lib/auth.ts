import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { getOAuthState } from "better-auth/api";
import { bearer, jwt } from "better-auth/plugins";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";
import { profiles } from "@/db/schema";
import {
  emailLocaleFromRequest,
  sendVerificationEmail,
} from "@/lib/email-notifications";
import {
  createLegalAcceptance,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/legal-consent";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const jwtExpiresInSeconds = 15 * 60;

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        disableImplicitSignUp: true,
        prompt: "select_account" as const,
      }
    : undefined;

export const auth = betterAuth({
  appName: "PeerSlot",
  baseURL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  user: {
    additionalFields: {
      termsAccepted: {
        type: "boolean",
        required: true,
        returned: false,
        // The service-use notice applies to every registration. Google does
        // not supply this field; the create hook records the date and versions.
        defaultValue: () => true,
        validator: { input: z.literal(true) },
      },
      termsAcceptedAt: {
        type: "date",
        required: false,
        input: false,
        returned: false,
        defaultValue: () => new Date(),
      },
      termsVersion: {
        type: "string",
        required: false,
        input: false,
        returned: false,
        defaultValue: TERMS_VERSION,
      },
      privacyVersion: {
        type: "string",
        required: false,
        input: false,
        returned: false,
        defaultValue: PRIVACY_VERSION,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const acceptance = createLegalAcceptance(newUser, getOAuthState());
          if (!acceptance) return false;

          return { data: { ...newUser, ...acceptance } };
        },
        after: async (createdUser) => {
          await db
            .insert(profiles)
            .values({ userId: createdUser.id })
            .onConflictDoNothing();
        },
      },
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendOnSignIn: true,
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      const locale = emailLocaleFromRequest(request);
      after(() =>
        sendVerificationEmail({
          email: user.email,
          locale,
          name: user.name,
          token,
          verificationUrl: url,
        }),
      );
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 8,
    requireEmailVerification: true,
  },
  plugins: [
    bearer({ requireSignature: true }),
    jwt({
      jwt: {
        expirationTime: `${jwtExpiresInSeconds}s`,
        definePayload: ({ user }) => ({
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          name: user.name,
        }),
      },
      jwks: {
        rotationInterval: 60 * 60 * 24 * 30,
        gracePeriod: 60 * 60 * 24,
      },
    }),
  ],
  socialProviders: {
    ...(google ? { google } : {}),
  },
  trustedOrigins: [baseURL],
});
