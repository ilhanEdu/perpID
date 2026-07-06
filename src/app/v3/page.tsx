import { redirect } from "next/navigation";

/** V3 is now served at the root — keep /v3 as a permanent alias. */
export default function V3Page() {
  redirect("/");
}
