import { redirect } from "next/navigation";

export default function Home() {
  // AuthGuard inside /console will bounce unauthenticated visitors to /login.
  redirect("/console/overview");
}
