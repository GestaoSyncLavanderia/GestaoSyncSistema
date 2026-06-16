"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Lock, Eye, EyeOff, WashingMachine } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      login,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email ou senha incorretos. Tente novamente.");
    } else {
      router.push("/dashboard/faturamento");
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 55%, #0F2944 100%)",
      }}
    >
      {/* Dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
          backgroundSize: "36px 36px",
        }}
      />

      {/* Glow blobs */}
      <div
        className="absolute top-[-120px] right-[-120px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "#3B82F6", opacity: 0.08, filter: "blur(90px)" }}
      />
      <div
        className="absolute bottom-[-80px] left-[-80px] w-[350px] h-[350px] rounded-full pointer-events-none"
        style={{ background: "#10B981", opacity: 0.07, filter: "blur(70px)" }}
      />

      {/* Content */}
      <div className="relative w-full max-w-[400px] mx-4 flex flex-col items-center">
        {/* Brand */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{
            background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
            boxShadow: "0 8px 24px rgba(59,130,246,0.45)",
          }}
        >
          <WashingMachine size={30} color="white" />
        </div>

        <h1 className="text-white text-xl font-semibold mb-1 text-center">
          Painel de gestão e faturamento
        </h1>
        <p className="text-[#94A3B8] text-sm mb-8 text-center">
          Faça login para acessar o dashboard
        </p>

        {/* Card */}
        <div
          className="w-full bg-white rounded-2xl p-8"
          style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.45)" }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Usuário</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                  placeholder="Administrador"
                  autoComplete="username"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E5E7EB] rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Senha</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-[#E5E7EB] rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60 mt-1"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
                boxShadow: "0 4px 14px rgba(59,130,246,0.4)",
              }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
