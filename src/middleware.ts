import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/features/auth/session";

// First line of defence only; every server action re-checks with requireUser(),
// so a gap here is never the only thing standing between a caller and the data.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.JWT_SECRET;
  if (token && secret && (await verifySession(token, secret))) return NextResponse.next();

  const url = new URL("/login", req.url);
  // The path only; a query string here would be reflected back into the login
  // page, and safeNext has to be the single place that decides what is safe.
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // The (?:/|$) matters: a bare `login` prefix would also exempt `/loginfoo`,
  // and any future route starting with those letters would be public by accident.
  matcher: ["/((?!login(?:/|$)|p/|_next/|favicon\\.ico$).*)"],
};
