export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas grid place-items-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <p className="text-title text-fg font-bold">Buranchi</p>
          <p className="text-body text-muted">Customer Operations Dashboard</p>
        </div>
        {children}
      </div>
    </div>
  );
}
