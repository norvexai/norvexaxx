const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = cents => usd.format((cents || 0) / 100);
export const shortDate = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const toCents = value => Math.round(Number(value) * 100);
