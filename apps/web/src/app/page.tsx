import { redirect } from "next/navigation";

// D045: the landing page scaffold never got built out (it was a stub
// pointing at ui-reference/png for a future implementation); per explicit
// user request, "/" now redirects straight into the working product
// instead of showing that placeholder.
export default function Page() {
  redirect("/analyze");
}
