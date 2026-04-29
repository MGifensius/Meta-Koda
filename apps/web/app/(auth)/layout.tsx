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

      <div className="relative w-full max-w-[420px]">
        {children}
      </div>
    </div>
  );
}
