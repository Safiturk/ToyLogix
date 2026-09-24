// Enable only after the hardening migration and server secrets are deployed.
export const accountHardeningEnabled =
  process.env.NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED === "true";
