import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Stripe subscriptions through the REST API (no SDK, so no version churn):
 * Checkout for upgrades, the customer portal for management, and a signed
 * webhook that is the single source of truth for the user's plan.
 */
export async function billingRoutes(app: FastifyInstance) {
  const stripe = async (path: string, params: Record<string, string>) => {
    const res = await app.fetchImpl(`https://api.stripe.com/v1${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${app.config.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw Object.assign(new Error("Payment provider error"), { statusCode: 502, detail: data });
    return data;
  };

  const configured = () => !!(app.config.STRIPE_SECRET_KEY && app.config.STRIPE_PRICE_ID);

  app.post("/checkout", { preHandler: app.requireUser }, async (req, reply) => {
    if (!configured()) return reply.code(503).send({ error: "Billing is not configured on this server" });
    const user = req.user!;
    const params: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": app.config.STRIPE_PRICE_ID!,
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      success_url: `${app.config.APP_URL}/account?upgraded=1`,
      cancel_url: `${app.config.APP_URL}/account`,
      "metadata[user_id]": user.id,
      "subscription_data[metadata][user_id]": user.id,
    };
    if (user.stripe_customer_id) params.customer = user.stripe_customer_id;
    else params.customer_email = user.email;
    const session = await stripe("/checkout/sessions", params);
    return { url: session.url };
  });

  app.post("/portal", { preHandler: app.requireUser }, async (req, reply) => {
    if (!configured()) return reply.code(503).send({ error: "Billing is not configured on this server" });
    if (!req.user!.stripe_customer_id) return reply.code(400).send({ error: "No subscription yet" });
    const session = await stripe("/billing_portal/sessions", { customer: req.user!.stripe_customer_id, return_url: `${app.config.APP_URL}/account` });
    return { url: session.url };
  });

  app.post("/webhook", { config: { rateLimit: false } }, async (req, reply) => {
    const secret = app.config.STRIPE_WEBHOOK_SECRET;
    if (!secret) return reply.code(503).send({ error: "Billing is not configured" });
    const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? "";
    if (!verifyStripeSignature(raw, String(req.headers["stripe-signature"] ?? ""), secret)) {
      return reply.code(400).send({ error: "Bad signature" });
    }
    const event = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
    const obj = event.data.object;
    if (event.type === "checkout.session.completed") {
      const userId = (obj.client_reference_id as string | undefined) ?? (obj.metadata as Record<string, string> | undefined)?.user_id;
      if (userId) {
        await app.db
          .updateTable("users")
          .set({ plan: "pro", stripe_customer_id: (obj.customer as string | null) ?? null })
          .where("id", "=", userId)
          .execute();
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const status = obj.status as string;
      const active = event.type === "customer.subscription.updated" && (status === "active" || status === "trialing" || status === "past_due");
      await app.db
        .updateTable("users")
        .set({ plan: active ? "pro" : "free" })
        .where("stripe_customer_id", "=", obj.customer as string)
        .execute();
    }
    return { received: true };
  });
}

/** Stripe-Signature: t=timestamp,v1=hex(hmac_sha256(secret, `${t}.${payload}`)), 5-minute tolerance. */
export function verifyStripeSignature(payload: string, header: string, secret: string, now = Date.now()): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  const v1s = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  if (!t || !v1s.length || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return v1s.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}
