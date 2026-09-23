# Commercial readiness

PeerSlot currently provides scheduling workflows, not subscription billing. Do not charge users or describe a paid plan as available until the following decisions and controls are implemented and tested.

## Product and pricing decisions

- Define the customer as the provider or organization that hosts appointment pages.
- Decide whether clients ever pay through PeerSlot or only book provider-managed appointments.
- Define plans, included usage, overage behavior, trial duration, cancellation, refunds, taxes, and currency.
- Decide whether Google Meet, email volume, client records, and reschedule limits are included in every plan.
- Write the plan comparison in the same English and Turkish terms used in the product.

## Billing implementation

- Choose a payment processor that supports the operating entity, currency, and target countries.
- Create checkout and customer-portal flows without storing card details in PeerSlot.
- Persist processor customer, subscription, price, status, renewal, and cancellation identifiers.
- Verify every webhook signature and make webhook handling idempotent. A browser redirect must never be the source of truth for payment status.
- Grant and revoke features from durable subscription state, with a defined grace period for failed payments.
- Handle duplicate events, out-of-order events, refunds, chargebacks, plan changes, and provider account deletion.
- Add an internal support path for billing corrections and a record of operator actions.

## Commercial operations

- Establish the legal operating entity, billing address, tax treatment, and jurisdiction before publishing paid Terms.
- Provide invoices or receipts where required and identify the support contact users can reach about billing.
- Document data processors and retention for the payment provider in the Privacy Policy.
- Test the complete lifecycle in the processor's sandbox: trial, first payment, renewal, failed payment, cancellation, refund, and account deletion.
- Keep payment credentials and webhook secrets in the production secret manager only.

Until this work is complete, the safe launch mode is a private beta or free pilot with an explicit invitation. The application's current Terms still contain a placeholder for the operating entity and jurisdiction; update that section before accepting payment.
