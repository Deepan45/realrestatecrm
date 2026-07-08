import Link from "next/link";
import ExitIntentModal from "@/components/ExitIntentModal";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-4">
          <Link href="/blog" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white shadow-sm">R</div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight text-slate-800">RealRest</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-gold-600">Insights &amp; Guides</div>
            </div>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} RealRest. All rights reserved.
      </footer>
      <ExitIntentModal />
    </div>
  );
}
