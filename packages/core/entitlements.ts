export function hasPremium(
  billing: { status: string; periodEnd?: number } | null | undefined,
  now = Date.now(),
) {
  return Boolean(
    billing &&
    ["active", "trialing"].includes(billing.status) &&
    Number.isFinite(billing.periodEnd) &&
    billing.periodEnd! > now,
  );
}

export function needsBillingPortal(status: string) {
  return !["free", "canceled", "incomplete_expired"].includes(status);
}
