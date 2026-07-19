import { redirect } from "next/navigation";

// D045: any URL that doesn't match a real route falls through to Next's
// App Router 404 handling, which renders this file if present instead of
// the framework default. Per explicit user request, unmatched routes
// redirect into the product rather than showing a 404 page. This only
// catches genuinely unmatched URLs — no existing route calls notFound()
// for an in-app "missing" state (e.g. a bad analysis id renders its own
// custom empty/error UI instead), so this never hijacks intentional UX.
export default function NotFound() {
  redirect("/analyze");
}
