export function ZyraLogo({ size = 32, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="zyraGrad" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#zyraGrad)" />
      <path d="M12 16h24l-10 8 10 8H12l10-8-10-8z" fill="white" opacity="0.95" />
      <circle cx="24" cy="24" r="4" fill="white" opacity="0.6" />
    </svg>
  );
}

export function ZyraLogoFull({ size = 32, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <ZyraLogo size={size} />
      <div>
        <h1 className="font-bold text-base tracking-tight text-gray-900 dark:text-gray-100 leading-none">Zyra</h1>
        <p className="text-[9px] text-gray-400 tracking-widest uppercase leading-none mt-0.5">ERP</p>
      </div>
    </div>
  );
}

export default ZyraLogo;
