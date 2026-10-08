import { NextResponse } from "next/server";
import { getBoardSnapshot } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await getBoardSnapshot();
    return NextResponse.json(snap);
  } catch (err) {
    return NextResponse.json(
      { error: "board unavailable", detail: String(err) },
      { status: 503 },
    );
  }
}
