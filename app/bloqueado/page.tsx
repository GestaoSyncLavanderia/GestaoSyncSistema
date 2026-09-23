"use client";

import { signOut } from "next-auth/react";
import { Info } from "lucide-react";

export default function BloqueadoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] px-6">
      <div className="w-full max-w-[720px] bg-white rounded-[28px] border border-[#E5E7EB] p-16 flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full bg-[#EFF6FF] flex items-center justify-center mb-8">
          <Info size={46} className="text-[#3B82F6]" />
        </div>

        <h1 className="text-4xl font-semibold text-gray-900 mb-4">
          Sistema temporariamente indisponível
        </h1>

        <p className="text-xl text-[#6B7280] leading-relaxed max-w-[560px]">
          Existem pendências a resolver antes de retomar o acesso. Por favor,
          entre em contato com o administrador do sistema.
        </p>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-10 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
