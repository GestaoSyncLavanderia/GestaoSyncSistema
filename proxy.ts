import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isLoginPage  = pathname === "/login";
  const isDashboard  = pathname.startsWith("/dashboard");
  const isAuthApi    = pathname.startsWith("/api/auth");
  const isSyncApi    = pathname.startsWith("/api/sync") || pathname.startsWith("/api/debug");
  const isApi        = pathname.startsWith("/api");

  if (isApi && !isAuthApi && !isSyncApi && !isLoggedIn) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/api/:path*"],
};
