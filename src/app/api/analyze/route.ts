/**
 * Token Analysis API Route
 * Server-side endpoint for Gemini AI analysis
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzeToken } from "@/lib/api/scanner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { success: false, error: "Token address is required" },
        { status: 400 }
      );
    }

    // Run the analysis (includes Gemini AI on server-side)
    const result = await analyzeToken(address);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] Analysis error:", error);
    
    const message = error instanceof Error 
      ? error.message 
      : "An unexpected error occurred";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
