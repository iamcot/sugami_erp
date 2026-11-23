export const dynamic = 'force-dynamic';

// Build id baked in at build time; the client compares it to detect a new deploy.
export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
