export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-200 via-sky-100 to-sky-50 grid place-items-center p-6">
      {/* Decorative cloud blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-[10%] left-[8%] h-40 w-72 rounded-full bg-white/60 blur-3xl"></div>
        <div className="absolute top-[40%] right-[12%] h-32 w-64 rounded-full bg-white/50 blur-3xl"></div>
        <div className="absolute bottom-[8%] left-[20%] h-36 w-80 rounded-full bg-white/55 blur-3xl"></div>
        <div className="absolute bottom-[20%] right-[18%] h-28 w-56 rounded-full bg-white/40 blur-3xl"></div>
      </div>

      {/* Brand mark top-left */}
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <div className="h-7 w-7 rounded-tile bg-fg flex items-center justify-center">
          <span className="text-white font-bold text-[12px]">B</span>
        </div>
        <span className="font-bold text-[15px] text-fg">Buranchi</span>
      </div>

      <div className="relative w-full max-w-[420px]">
        {children}
      </div>
    </div>
  );
}
