import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import OpenAI from "openai";

/**
 * RAG da base de conhecimento do assistente de ajuda.
 *
 * Os arquivos .md desta pasta são quebrados em trechos por seção, recebem
 * embeddings da OpenAI e ficam em memória. O índice é salvo no diretório temporário do SO com um
 * hash do conteúdo, então só é recalculado quando algum .md muda.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_CHUNK_CHARS = 1800;
const EMBED_BATCH_SIZE = 64;
const MIN_SCORE = 0.25;

export interface KnowledgeChunk {
  id: string;
  title: string;
  module: string;
  routes: string[];
  section: string;
  text: string;
}

interface IndexedChunk extends KnowledgeChunk {
  embedding: number[];
  terms: Set<string>;
}

export interface KnowledgeHit {
  chunk: KnowledgeChunk;
  score: number;
}

function resolveKnowledgeDir(): string {
  const candidates = [__dirname, path.resolve(process.cwd(), "src", "helpAssistant", "knowledge")];
  const found = candidates.find((dir) => fs.existsSync(dir) && fs.readdirSync(dir).some((file) => file.endsWith(".md")));
  return found ?? candidates[0];
}

const CACHE_FILE = path.join(os.tmpdir(), "smartbuild-help-assistant-index.json");

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const STOPWORDS = new Set(
  "a o e de da do das dos em no na nos nas um uma para por com como que se ao os as é eu meu minha the to of and in on for is how what do i my".split(" ")
);

function tokenize(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2 && !STOPWORDS.has(term))
  );
}

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta: Record<string, string> = {};
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  const routes = (meta.routes ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((route) => route.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return { meta, routes, body: match ? raw.slice(match[0].length) : raw };
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const parts: string[] = [];
  let current = "";
  for (const block of text.split(/\n(?=### )|\n\s*\n/)) {
    if (current && current.length + block.length > MAX_CHUNK_CHARS) {
      parts.push(current.trim());
      current = "";
    }
    current += `${block}\n\n`;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function chunkFile(fileName: string, raw: string): KnowledgeChunk[] {
  const { meta, routes, body } = parseFrontmatter(raw);
  const title = meta.title || fileName.replace(/\.md$/, "");
  const module = meta.module || "general";
  const chunks: KnowledgeChunk[] = [];

  const sections = body.split(/\n(?=## )/);
  sections.forEach((sectionRaw, sectionIndex) => {
    const section = sectionRaw.match(/^## (.+)/)?.[1]?.trim() ?? "Introdução";
    const content = sectionRaw.replace(/^# .+\n?/m, "").trim();
    if (content.replace(/^## .+/, "").trim().length < 20) return;

    splitLong(content).forEach((part, partIndex) => {
      chunks.push({
        id: `${fileName}#${sectionIndex}.${partIndex}`,
        title,
        module,
        routes,
        section,
        text: `# ${title}\n${part}`,
      });
    });
  });
  return chunks;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function routeMatches(pattern: string, route: string): boolean {
  const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\/:[^/]+/g, "/[^/]+")}/?$`);
  return regex.test(route);
}

export class KnowledgeBase {
  private indexPromise: Promise<IndexedChunk[]> | null = null;

  constructor(private readonly openai: OpenAI) {}

  private async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts.slice(i, i + EMBED_BATCH_SIZE),
      });
      vectors.push(...response.data.map((item) => item.embedding));
    }
    return vectors;
  }

  private async buildIndex(): Promise<IndexedChunk[]> {
    const dir = resolveKnowledgeDir();
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".md")).sort() : [];
    const chunks = files.flatMap((file) => chunkFile(file, fs.readFileSync(path.join(dir, file), "utf8")));
    if (!chunks.length) return [];

    const hash = crypto
      .createHash("sha256")
      .update(EMBEDDING_MODEL)
      .update(JSON.stringify(chunks))
      .digest("hex");

    let embeddings: number[][] | null = null;
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      if (cached?.hash === hash && Array.isArray(cached.embeddings)) embeddings = cached.embeddings;
    } catch {
      // sem cache válido: recalcula abaixo
    }

    if (!embeddings) {
      embeddings = await this.embed(chunks.map((chunk) => chunk.text));
      try {
        fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ hash, embeddings }));
      } catch (error) {
        console.warn("[HelpAssistant] could not write knowledge cache:", error);
      }
      console.log(`[HelpAssistant] knowledge index built: ${files.length} files, ${chunks.length} chunks`);
    }

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings![index],
      terms: tokenize(`${chunk.title} ${chunk.section} ${chunk.text}`),
    }));
  }

  private getIndex(): Promise<IndexedChunk[]> {
    if (!this.indexPromise) {
      this.indexPromise = this.buildIndex().catch((error) => {
        this.indexPromise = null;
        throw error;
      });
    }
    return this.indexPromise;
  }

  /**
   * Busca híbrida: similaridade semântica + sobreposição de termos
   * (ajuda com nomes exatos de botões/status) + bônus para a tela atual.
   */
  async search(query: string, options: { route?: string | null; limit?: number } = {}): Promise<KnowledgeHit[]> {
    const index = await this.getIndex();
    if (!index.length || !query.trim()) return [];

    const [queryVector] = await this.embed([query]);
    const queryTerms = tokenize(query);
    const limit = options.limit ?? 6;

    return index
      .map((chunk) => {
        let overlap = 0;
        queryTerms.forEach((term) => {
          if (chunk.terms.has(term)) overlap += 1;
        });
        const keyword = queryTerms.size ? overlap / queryTerms.size : 0;
        const onRoute = options.route && chunk.routes.some((route) => routeMatches(route, options.route!)) ? 0.05 : 0;
        return { chunk, score: cosine(queryVector, chunk.embedding) + 0.15 * keyword + onRoute };
      })
      .filter((hit) => hit.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ chunk, score }) => ({
        chunk: {
          id: chunk.id,
          title: chunk.title,
          module: chunk.module,
          routes: chunk.routes,
          section: chunk.section,
          text: chunk.text,
        },
        score,
      }));
  }
}
