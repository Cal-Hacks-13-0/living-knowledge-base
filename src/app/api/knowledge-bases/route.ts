import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, fail, handleApiError } from "@/lib/api/response";
import { CreateKnowledgeBaseRequestSchema, validateUrl } from "@/lib/validation/schemas";
import { syncJobForKnowledgeBase } from "@/lib/jobs/scheduler";
import { syncKnowledgeBaseToVaultSafe } from "@/lib/vault/sync";

export async function GET() {
  try {
    const knowledgeBases = await prisma.knowledgeBase.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { sources: true, entries: true, insights: true } },
      },
    });
    return ok(knowledgeBases);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = CreateKnowledgeBaseRequestSchema.parse(await req.json());

    for (const source of body.sources) {
      const validation = validateUrl(source.url);
      if (!validation.ok) {
        return fail(`Invalid source URL "${source.url}": ${validation.error}`, 400);
      }
    }

    const knowledgeBase = await prisma.$transaction(async (tx) => {
      const kb = await tx.knowledgeBase.create({
        data: {
          name: body.name,
          description: body.description,
          userGoal: body.userGoal,
          preferencesJson: JSON.stringify(body.preferences ?? {}),
          monitoringFrequency: body.monitoringFrequency,
        },
      });

      for (const category of body.categories) {
        const parent = await tx.knowledgeCategory.create({
          data: {
            knowledgeBaseId: kb.id,
            name: category.name,
            description: category.description,
          },
        });
        for (const sub of category.subtopics) {
          await tx.knowledgeCategory.create({
            data: {
              knowledgeBaseId: kb.id,
              name: sub.name,
              description: sub.description,
              parentId: parent.id,
            },
          });
        }
      }

      for (const source of body.sources) {
        await tx.source.create({
          data: {
            knowledgeBaseId: kb.id,
            name: source.name,
            url: source.url,
            type: source.type,
          },
        });
      }

      return kb;
    });

    if (knowledgeBase.monitoringFrequency !== "MANUAL") {
      syncJobForKnowledgeBase(knowledgeBase.id, knowledgeBase.monitoringFrequency);
    }
    await syncKnowledgeBaseToVaultSafe(knowledgeBase.id);

    return ok(knowledgeBase, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
