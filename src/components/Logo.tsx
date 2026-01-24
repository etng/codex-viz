import React from "react";

export function Logo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Stylized 'C' Ring */}
      <path
        d="M96 36C91.5 24.5 80.5 16 67.5 16C43.4756 16 24 35.4756 24 59.5C24 83.5244 43.4756 103 67.5 103C81.5 103 93 94 98 81"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        className="text-slate-900"
      />
      
      {/* Bar Chart Elements */}
      {/* Left Bar - Emerald */}
      <rect x="42" y="52" width="10" height="28" rx="3" className="fill-emerald-400" />
      
      {/* Middle Bar - Cyan */}
      <rect x="60" y="42" width="10" height="38" rx="3" className="fill-cyan-400" />
      
      {/* Right Bar - Blue */}
      <rect x="78" y="32" width="10" height="48" rx="3" className="fill-blue-500" />
    </svg>
  );
}
