import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";

function normalizeTheme(theme?: string | null): "theme-dark" | "theme-bright" {
  if (theme === "theme-bright" || theme === "theme-swiss" || theme === "theme-comics") {
    return "theme-bright";
  }
  return "theme-dark";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let settings = await prisma.creatorSettings.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      settings = await prisma.creatorSettings.create({
        data: {
          id: "default",
          default_months_open: 3,
          default_id_generation_type: "date_counter",
          default_theme: "theme-dark",
          feedback_categories: JSON.stringify([
            "Pacing / Dead Air",
            "Audio / SFX",
            "B-Roll / Visuals",
            "Typography",
            "Retention Hook",
            "SOP Miss",
          ]),
        },
      });
    }

    return NextResponse.json({
      ...settings,
      default_theme: normalizeTheme(settings.default_theme),
      feedback_categories: JSON.parse(settings.feedback_categories),
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCreator = isCreatorEmail(session.user.email) || session.user.role === "creator";

  try {
    const body = await req.json();
    const {
      default_months_open,
      default_id_generation_type,
      default_theme,
      feedback_categories,
    } = body;

    const normalizedTheme = default_theme ? normalizeTheme(default_theme) : undefined;

    const updateData: any = {};
    if (default_months_open) updateData.default_months_open = Number(default_months_open);
    if (normalizedTheme) updateData.default_theme = normalizedTheme;
    if (isCreator) {
      if (default_id_generation_type) updateData.default_id_generation_type = default_id_generation_type;
      if (feedback_categories) updateData.feedback_categories = JSON.stringify(feedback_categories);
    }

    const updated = await prisma.creatorSettings.upsert({
      where: { id: "default" },
      update: updateData,
      create: {
        id: "default",
        default_months_open: default_months_open ? Number(default_months_open) : 3,
        default_id_generation_type: default_id_generation_type || "date_counter",
        default_theme: normalizedTheme || "theme-dark",
        feedback_categories: JSON.stringify(
          feedback_categories || [
            "Pacing / Dead Air",
            "Audio / SFX",
            "B-Roll / Visuals",
            "Typography",
            "Retention Hook",
            "SOP Miss",
          ]
        ),
      },
    });

    return NextResponse.json({
      ...updated,
      feedback_categories: JSON.parse(updated.feedback_categories || "[]"),
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
