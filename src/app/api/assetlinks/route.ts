import { NextResponse } from "next/server";
import { vinculosDoApp } from "@/lib/appAndroid";

/**
 * `/.well-known/assetlinks.json` (reescrito para cá em `next.config.ts`):
 * confirma ao Android que o app da Astro Soluções é deste site. Lê a
 * variável a cada pedido, então trocar a chave na Vercel vale após o
 * redeploy, sem commit. Ver `src/lib/appAndroid.ts`.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(vinculosDoApp(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
