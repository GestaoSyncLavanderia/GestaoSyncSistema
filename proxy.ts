import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  // Trava geral do sistema por pendência administrativa — liga/desliga via env var no Vercel.
  const isLocked   = process.env.SYSTEM_LOCKED === "true";
  const { pathname } = req.nextUrl;

  const isLoginPage  = pathname === "/login";
  const isLockPage   = pathname === "/bloqueado";
  const isDashboard  = pathname.startsWith("/dashboard");
  const isAuthApi    = pathname.startsWith("/api/auth");
  const isSyncApi    = pathname.startsWith("/api/sync") || pathname.startsWith("/api/debug");
  const isApi        = pathname.startsWith("/api");

  if (isApi && !isAuthApi && !isSyncApi) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (isLocked) {
      return NextResponse.json({ error: "Sistema temporariamente indisponível." }, { status: 503 });
    }
  }

  if ((isDashboard || isLockPage) && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL(isLocked ? "/bloqueado" : "/dashboard/faturamento", req.url));
  }

  // Enquanto travado, usuário logado só pode ver a tela de indisponibilidade.
  if (isLocked && isLoggedIn && isDashboard) {
    return NextResponse.redirect(new URL("/bloqueado", req.url));
  }

  // Destravado: ninguém deve ficar preso numa URL de /bloqueado salva.
  if (!isLocked && isLockPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard/faturamento", req.url));
  }

  // /dashboard sem ?tab= redireciona para faturamento
  if (pathname === "/dashboard" && !req.nextUrl.searchParams.has("tab")) {
    return NextResponse.redirect(new URL("/dashboard/faturamento", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/bloqueado", "/api/:path*"],
};
