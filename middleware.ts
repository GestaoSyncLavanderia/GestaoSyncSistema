import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/dashboard" && !searchParams.has("tab")) {
    return NextResponse.redirect(new URL("/dashboard/faturamento", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/dashboard",
};
