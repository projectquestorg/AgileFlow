import { z } from "zod"

/**
 * Environment Variable Schema
 *
 * Validates all environment variables on app startup.
 * Fails fast with helpful error messages if validation fails.
 */

// Schema for server-side environment variables
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
})

// Schema for client-side (NEXT_PUBLIC_*) environment variables
const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL (e.g., https://agileflow.dev)")
    .default("http://localhost:3000"),

  NEXT_PUBLIC_V0_URL: z
    .string()
    .url("NEXT_PUBLIC_V0_URL must be a valid URL (e.g., https://v0.dev)")
    .optional(),

  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z
    .string()
    .min(1, "NEXT_PUBLIC_PLAUSIBLE_DOMAIN must be a valid domain (e.g., agileflow.dev)")
    .optional(),
})

// Combined schema
const envSchema = serverEnvSchema.merge(clientEnvSchema)

// Type inference
export type Env = z.infer<typeof envSchema>

/**
 * Validates environment variables and returns typed env object.
 * Throws descriptive error on validation failure.
 */
function validateEnv(): Env {
  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_V0_URL: process.env.NEXT_PUBLIC_V0_URL,
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
  })

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const errorMessages = Object.entries(errors)
      .map(([field, messages]) => {
        const msgList = messages?.join(", ") ?? "Invalid value"
        return `  - ${field}: ${msgList}`
      })
      .join("\n")

    console.error(
      "\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "❌ Invalid environment variables:\n" +
        errorMessages +
        "\n\n" +
        "💡 Fix suggestions:\n" +
        "  1. Copy .env.example to .env.local\n" +
        "  2. Fill in the required values\n" +
        "  3. Restart the development server\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    )

    throw new Error(`Invalid environment variables: ${errorMessages}`)
  }

  return parsed.data
}

/**
 * Validated environment variables.
 * Import this instead of using process.env directly.
 *
 * @example
 * import { env } from "@/lib/env"
 * const url = env.NEXT_PUBLIC_APP_URL
 */
export const env = validateEnv()

/**
 * Headers that should be stripped in production for security.
 * These can leak server information to attackers.
 */
export const SENSITIVE_HEADERS = [
  "Server",
  "X-Powered-By",
  "Server-Timing",
] as const

/**
 * Check if we're in production mode.
 */
export const isProduction = env.NODE_ENV === "production"

/**
 * Check if we're in development mode.
 */
export const isDevelopment = env.NODE_ENV === "development"
