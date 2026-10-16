import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  const { next } = await searchParams;
  if (user) redirect(next && next.startsWith("/") ? next : "/");
  return (
    <div className="relative z-10 min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* left: the board as a poster */}
      <section className="relative hidden overflow-hidden bg-board lg:block">
        <img
          src="/images/board.jpg"
          alt="A small Indian shop counter at dusk with a glowing UPI QR standee"
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-board via-board/85 to-board/25" />
        <div className="relative flex h-full flex-col justify-between p-10 text-paper">
          <div className="flex items-center gap-3">
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="3" fill="#E0702A" />
              <circle cx="8.5" cy="16" r="3.1" fill="#16130E" />
              <circle cx="16" cy="16" r="3.1" fill="#16130E" />
              <circle cx="23.5" cy="16" r="3.1" fill="#16130E" />
            </svg>
            <span className="font-mono text-xs tracking-[0.2em] uppercase">
              Is It Down, India?
            </span>
          </div>
          <div>
            <h1 className="display max-w-[13ch] text-[clamp(2.6rem,4.4vw,4.2rem)] leading-[0.95]">
              UPI at 10:04 AM. IRCTC at Tatkal. GST on the 11th.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-paper/70">
              We probe twelve of the services India runs on every 30 seconds — and
              we listen when people in Dhule, Pune, Chennai and Lucknow say it is
              failing for them.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 font-mono text-[11px] tracking-[0.16em] text-paper/55 uppercase">
            <span>30s probes</span>
            <span>4 languages</span>
            <span>Telegram alerts</span>
            <span>Public incident log</span>
          </div>
        </div>
      </section>

      {/* right: the form, printed on paper */}
      <section className="flex min-h-dvh flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[420px]">
          <Link href="/" className="micro mb-6 inline-block hover:text-ink">
            ← Back to the status board
          </Link>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
