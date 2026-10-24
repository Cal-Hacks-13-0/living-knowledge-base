import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ok, fail, handleApiError, NotFoundError } from "@/lib/api/response";
import { CreateSourceRequestSchema, validateUrl } from "@/lib/validation/schemas";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sources = await prisma.source.findMany({
      where: { knowledgeBaseId: id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { documents: true } } },
    });
    return ok(sources);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb) throw new NotFoundError(`Knowledge base not found: ${id}`);

    const body = CreateSourceRequestSchema.parse(await req.json());
    const validation = validateUrl(body.url);
    if (!validation.ok) return fail(`Invalid URL: ${validation.error}`, 400);

    const existing = await prisma.source.findUnique({
      where: { knowledgeBaseId_url: { knowledgeBaseId: id, url: body.url } },
    });
    if (existing) return fail("This source URL is already tracked for this knowledge base.", 409);

    const source = await prisma.source.create({
      data: { knowledgeBaseId: id, name: body.name, url: body.url, type: body.type },
    });
    return ok(source, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
