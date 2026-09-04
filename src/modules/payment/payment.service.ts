import Stripe from "stripe";
import { BillStatus, PaymentStatus, Prisma } from "@prisma/client";
import { stripe } from "../../config/stripe";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { recordAudit } from "../audit/audit.service";

/**
 * STEP 4 — Stripe Payment Flow, against an unpaid Bill.
 *
 * Flow:
 *   1. createCheckoutSession(): looks up the Bill, refuses if it's already
 *      settled or doesn't belong to the caller, creates a Stripe Checkout
 *      Session for exactly `bill.amountDue`, and records a PENDING Payment
 *      row linked to that Bill.
 *   2. handleWebhookEvent(): Stripe calls back on `payment_intent.succeeded`
 *      (the source of truth that money actually moved — Checkout Session
 *      events fire before/around this and are treated as secondary
 *      bookkeeping signals, not the trigger for marking a Bill paid).
 *      The Payment is marked SUCCEEDED, the linked Bill is marked PAID, and
 *      an AuditLog row is written — all inside one Prisma transaction, so a
 *      crash between steps can never leave the Bill "paid" with no matching
 *      Payment record (or vice versa).
 */

export async function createCheckoutSession(userId: string, email: string, billId: string) {
  const bill = await prisma.bill.findFirst({ where: { id: billId, deletedAt: null } });

  if (!bill) throw ApiError.notFound("Bill not found");
  if (bill.userId !== userId) {
    throw ApiError.forbidden("You are not permitted to pay this bill");
  }
  if (bill.status === BillStatus.PAID) {
    throw ApiError.conflict("This bill has already been paid");
  }
  if (bill.status === BillStatus.CANCELLED) {
    throw ApiError.conflict("This bill has been cancelled and cannot be paid");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: bill.currency,
          unit_amount: bill.amountDue,
          product_data: {
            name: `Electricity Bill — ${bill.billingPeriodStart.toISOString().slice(0, 10)} to ${bill.billingPeriodEnd.toISOString().slice(0, 10)}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: { userId, billId: bill.id },
    success_url: `${env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.STRIPE_CANCEL_URL,
  });

  // For Checkout Sessions in "payment" mode, Stripe creates the underlying
  // PaymentIntent immediately (it doesn't wait for the customer to pay), so
  // session.payment_intent is already a usable ID here — capturing it now
  // lets the webhook correlate payment_intent.succeeded straight back to
  // this Payment row without any extra lookup.
  const payment = await prisma.payment.create({
    data: {
      userId,
      billId: bill.id,
      amount: bill.amountDue,
      currency: bill.currency,
      status: PaymentStatus.PENDING,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      description: `Payment for bill ${bill.id}`,
    },
  });

  await recordAudit({
    userId,
    action: "PAYMENT_CHECKOUT_CREATED",
    entity: "Payment",
    entityId: payment.id,
    metadata: { billId: bill.id, amount: bill.amountDue, currency: bill.currency },
  });

  return { checkoutUrl: session.url, sessionId: session.id, payment };
}

/**
 * Verifies the Stripe webhook signature. Requires the RAW request body —
 * see app.ts, where this route is mounted with express.raw() ahead of the
 * global express.json() parser, since Stripe's HMAC check is computed over
 * the exact bytes it sent and breaks if the body has been parsed/re-serialized.
 */
export async function handleWebhookEvent(rawBody: Buffer, signature: string) {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
    throw ApiError.badRequest("Invalid Stripe webhook signature");
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await prisma.payment.updateMany({
        where: { stripePaymentIntentId: intent.id },
        data: { status: PaymentStatus.FAILED },
      });
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await prisma.payment.updateMany({
        where: { stripeCheckoutSessionId: session.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      break;
    }

    default:
      logger.info(`Unhandled Stripe event type: ${event.type}`);
  }

  return { received: true };
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (!payment) {
      logger.warn(
        `Received payment_intent.succeeded for unknown PaymentIntent ${paymentIntent.id} — no matching Payment row`
      );
      return;
    }

    if (payment.status === PaymentStatus.SUCCEEDED) {
      // Already processed on a previous webhook delivery — no-op.
      return;
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCEEDED },
    });

    if (payment.billId) {
      await tx.bill.update({
        where: { id: payment.billId },
        data: { status: BillStatus.PAID },
      });
    }

    await recordAudit(
      {
        userId: payment.userId,
        action: "PAYMENT_SUCCEEDED",
        entity: "Payment",
        entityId: payment.id,
        metadata: {
          billId: payment.billId,
          amount: payment.amount,
          currency: payment.currency,
          stripePaymentIntentId: paymentIntent.id,
        },
      },
      tx
    );

    if (payment.billId) {
      await recordAudit(
        {
          userId: payment.userId,
          action: "BILL_PAID",
          entity: "Bill",
          entityId: payment.billId,
          metadata: { paymentId: payment.id },
        },
        tx
      );
    }
  });
}

export async function listOwnPayments(userId: string, page: number, limit: number) {
  const where: Prisma.PaymentWhereInput = { userId, deletedAt: null };
  const [total, payments] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { bill: { select: { id: true, billingPeriodStart: true, billingPeriodEnd: true, status: true } } },
    }),
  ]);
  return { payments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function listAllPayments(page: number, limit: number) {
  const where: Prisma.PaymentWhereInput = { deletedAt: null };
  const [total, payments] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        bill: { select: { id: true, status: true } },
      },
    }),
  ]);
  return { payments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
