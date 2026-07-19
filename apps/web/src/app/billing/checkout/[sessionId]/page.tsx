"use client";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { confirmCheckout, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { formatPlanPrice } from "@/lib/format";

export default function MockCheckoutPage() {
  // useSearchParams() requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <MockCheckoutPageContent />
    </Suspense>
  );
}

// Mirrors apps/api/app/billing.py's _sniff_card_brand — same BIN-prefix
// convention every real card form uses to show a live brand icon while
// typing (D039). Display-only here too: the backend independently derives
// and stores its own copy from the same digits, this never round-trips.
function sniffCardBrand(cardNumber: string): string | null {
  const digits = cardNumber.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("34") || digits.startsWith("37")) return "American Express";
  if (digits.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(digits) || digits.startsWith("2221") || digits.startsWith("2720")) return "Mastercard";
  if (digits.startsWith("6011") || digits.startsWith("65")) return "Discover";
  return "Card";
}

// Amex numbers are 15 digits (and take a 4-digit CID); every other network we
// recognize is 16 digits with a 3-digit CVC. Used to cap what the inputs even
// accept ("don't allow more than possible") and to length-check on submit.
function cardDigitLimit(brand: string | null): number {
  return brand === "American Express" ? 15 : 16;
}
function cvcLimit(brand: string | null): number {
  return brand === "American Express" ? 4 : 3;
}

function formatCardNumber(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  digits = digits.slice(0, cardDigitLimit(sniffCardBrand(digits)));
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

// Live MM/YY formatting the way real card forms behave — the month can never
// be typed as an impossible value (13–99), a leading 2–9 auto-pads to 02–09
// and advances, and the slash only appears once the year is started so
// backspacing doesn't fight an auto-inserted separator.
function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";

  let monthPart = digits.slice(0, 2);
  let rest = digits.slice(2);

  if (monthPart.length === 1) {
    // A single digit 2–9 can only be a padded month (02–09) — pad, done.
    if (Number(monthPart) > 1) {
      monthPart = `0${monthPart}`;
    } else {
      // "0" or "1": still ambiguous, wait for the second digit.
      return monthPart;
    }
  } else {
    const month = Number(monthPart);
    if (month === 0) {
      // "00" isn't a month — drop back to a single "0" awaiting a real digit.
      return "0";
    }
    if (month > 12) {
      // "13".."19": the first digit was the whole month (0X) and the second
      // digit is actually the start of the year.
      rest = monthPart[1] + rest;
      monthPart = `0${monthPart[0]}`;
    }
  }

  const yearPart = rest.slice(0, 2);
  // Month complete but no year yet — hold the slash back so a backspace
  // removes the last month digit instead of a re-inserted "/".
  if (yearPart.length === 0) return monthPart;
  return `${monthPart}/${yearPart}`;
}

// Standard Luhn checksum — the same check every real card form runs before it
// will let you submit. Rejects transposed digits and typos that a pure
// length check would wave through.
function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function cardNumberError(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "Enter your card number.";
  if (digits.length < cardDigitLimit(sniffCardBrand(digits))) return "Card number is incomplete.";
  if (!luhnValid(digits)) return "That card number isn't valid.";
  return null;
}

// Month must be 01–12 and the card must not already be expired (valid through
// the end of its stated month).
function expiryError(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return "Use MM/YY.";
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return "Month must be 01–12.";
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) return "This card has expired.";
  return null;
}

function cvcError(value: string, brand: string | null): string | null {
  const need = cvcLimit(brand);
  if (value.length === 0) return "Enter the CVC.";
  if (value.length !== need) return `CVC must be ${need} digits.`;
  return null;
}

// A couple of seconds of celebratory confirmation before the redirect
// (D039, user-requested) — long enough to register as a real moment, short
// enough not to feel like a forced wait.
const SUCCESS_DISPLAY_MS = 1900;

function MockCheckoutPageContent() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();

  const planName = searchParams.get("planName") ?? "your plan";
  const priceCents = Number(searchParams.get("priceCents") ?? 0);

  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [expiry, setExpiry] = useState("12/29");
  const [cvc, setCvc] = useState("123");
  const [cardholderName, setCardholderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [touched, setTouched] = useState<{ number?: boolean; expiry?: boolean; cvc?: boolean; name?: boolean }>({});

  const brand = sniffCardBrand(cardNumber);
  const numberErr = cardNumberError(cardNumber);
  const expiryErr = expiryError(expiry);
  const cvcErr = cvcError(cvc, brand);
  const nameErr = cardholderName.trim() ? null : "Enter the cardholder name.";
  const formValid = !numberErr && !expiryErr && !cvcErr && !nameErr;
  const renewsOn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!formValid) {
      // Surface every field's error at once instead of only the first —
      // the button is already disabled while invalid, this covers a submit
      // forced via Enter.
      setTouched({ number: true, expiry: true, cvc: true, name: true });
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await confirmCheckout(params.sessionId, {
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardExpiry: expiry,
        cardCvc: cvc,
        cardholderName: cardholderName.trim() || "Test Cardholder"
      });
      await refresh();
      setSucceeded(true);
      setTimeout(() => router.push("/billing?upgraded=1"), SUCCESS_DISPLAY_MS);
    } catch (err) {
      if (err instanceof ApiError && err.code === "checkout_expired") {
        setError("This checkout session expired. Go back to Billing and start again.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-4 flex items-center gap-2 rounded-control border border-warning/30 bg-warning/10 px-3.5 py-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-[12.5px] text-warning">
            Mock checkout — this is a simulated payment form. No real card is charged and no payment processor is
            involved.
          </p>
        </div>

        <div className="rounded-card border border-border-default bg-surface-1 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-[17px] font-semibold text-text-primary">Upgrade to {planName}</h1>
            <span className="text-[15px] font-semibold text-text-primary">{formatPlanPrice(priceCents)}</span>
          </div>

          {/* Order-summary line (D039) — reads closer to a real Stripe
              Checkout session (plan, cadence, next renewal date spelled
              out) instead of just a bare price next to the title. */}
          <div className="mt-3 flex items-center justify-between rounded-control border border-border-subtle bg-surface-2 px-3.5 py-2.5">
            <span className="text-[12.5px] text-text-secondary">Billed monthly</span>
            <span className="text-[12.5px] text-text-tertiary">Renews {renewsOn}</span>
          </div>

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="cc-name" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                Cardholder name
              </label>
              <Input
                id="cc-name"
                autoComplete="cc-name"
                required
                placeholder="Jane Doe"
                value={cardholderName}
                aria-invalid={touched.name && Boolean(nameErr)}
                onChange={(event) => setCardholderName(event.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              />
              {touched.name && nameErr ? <p className="mt-1.5 text-[12px] text-danger">{nameErr}</p> : null}
            </div>
            <div>
              <label htmlFor="cc-number" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                Card number
              </label>
              <div className="relative">
                <Input
                  id="cc-number"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  required
                  className="pr-24"
                  value={cardNumber}
                  aria-invalid={touched.number && Boolean(numberErr)}
                  onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
                  onBlur={() => setTouched((t) => ({ ...t, number: true }))}
                />
                {brand ? (
                  <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[11.5px] font-medium text-text-tertiary">
                    <CreditCard className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    {brand}
                  </span>
                ) : null}
              </div>
              {touched.number && numberErr ? <p className="mt-1.5 text-[12px] text-danger">{numberErr}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="cc-expiry" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                  Expiry
                </label>
                <Input
                  id="cc-expiry"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM/YY"
                  required
                  value={expiry}
                  aria-invalid={touched.expiry && Boolean(expiryErr)}
                  onChange={(event) => setExpiry(formatExpiry(event.target.value))}
                  onBlur={() => setTouched((t) => ({ ...t, expiry: true }))}
                />
                {touched.expiry && expiryErr ? <p className="mt-1.5 text-[12px] text-danger">{expiryErr}</p> : null}
              </div>
              <div>
                <label htmlFor="cc-cvc" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                  CVC
                </label>
                <Input
                  id="cc-cvc"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  required
                  maxLength={cvcLimit(brand)}
                  value={cvc}
                  aria-invalid={touched.cvc && Boolean(cvcErr)}
                  onChange={(event) => setCvc(event.target.value.replace(/\D/g, "").slice(0, cvcLimit(brand)))}
                  onBlur={() => setTouched((t) => ({ ...t, cvc: true }))}
                />
                {touched.cvc && cvcErr ? <p className="mt-1.5 text-[12px] text-danger">{cvcErr}</p> : null}
              </div>
            </div>

            {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}

            <Button type="submit" variant="primary" className="mt-1 w-full" disabled={submitting || succeeded || !formValid}>
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {submitting ? "Confirming…" : `Confirm ${formatPlanPrice(priceCents)}`}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[13px] text-text-secondary">
          <Link href="/billing" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
            Back to Billing
          </Link>
        </p>
      </div>

      {/* Post-payment confirmation popup (D039, user-requested) — a few
          seconds of animated confirmation before redirecting to Billing,
          rather than a hard cut straight to the static "plan updated"
          banner there. Fixed-position overlay so it reads as a genuine
          interrupt/celebration, not just another page-content block. */}
      {succeeded ? (
        <div
          className="animate-overlay-fade fixed inset-0 z-50 flex items-center justify-center bg-[#020208]/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="animate-success-pop flex flex-col items-center gap-3 rounded-card border border-success/30 bg-surface-1 px-8 py-7 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" strokeWidth={2} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-text-primary">Subscription activated</p>
              <p className="mt-1 text-[13px] text-text-secondary">You&apos;re on {planName} now. Redirecting to Billing…</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
