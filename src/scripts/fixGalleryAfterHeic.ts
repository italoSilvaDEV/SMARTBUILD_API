import "dotenv/config";
import {
    CopyObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import path from "path";
import { prisma } from "../utils/prisma";

const HEIC_MIME_TYPES = new Set([
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
]);
const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_BACKUP_PREFIX = "backups/gallery-heic/original";

type ScriptOptions = {
    batchSize: number;
    dryRun: boolean;
    backupPrefix: string;
};

type Summary = {
    scannedRows: number;
    uniqueKeys: number;
    duplicateRows: number;
    emptyUrls: number;
    candidates: number;
    skipped: number;
    backupsCreated: number;
    backupsReused: number;
    converted: number;
    errors: number;
};

function createS3Client() {
    return new S3Client({
        region: process.env.AMAZON_S3_REGION,
        credentials: {
            accessKeyId: process.env.AMAZON_S3_KEY!,
            secretAccessKey: process.env.AMAZON_S3_SECRET!,
        },
    });
}

function getBucketName() {
    const bucket = process.env.AMAZON_S3_BUCKET;
    if (!bucket) {
        throw new Error("AMAZON_S3_BUCKET nao esta configurado.");
    }

    return bucket;
}

function parseArgs(): ScriptOptions {
    let batchSize = DEFAULT_BATCH_SIZE;
    let dryRun = false;
    let backupPrefix = DEFAULT_BACKUP_PREFIX;

    for (const arg of process.argv.slice(2)) {
        if (arg === "--dry-run") {
            dryRun = true;
            continue;
        }

        if (arg.startsWith("--batch-size=")) {
            const parsedBatchSize = Number(arg.split("=")[1]);
            if (Number.isFinite(parsedBatchSize) && parsedBatchSize > 0) {
                batchSize = parsedBatchSize;
            }
            continue;
        }

        if (arg.startsWith("--backup-prefix=")) {
            backupPrefix = arg.split("=")[1] || DEFAULT_BACKUP_PREFIX;
        }
    }

    return {
        batchSize,
        dryRun,
        backupPrefix: backupPrefix.replace(/^\/+|\/+$/g, ""),
    };
}

function normalizeS3Key(rawUrl: string) {
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) {
        return "";
    }

    if (!/^https?:\/\//i.test(trimmedUrl)) {
        return trimmedUrl.replace(/^\/+/, "");
    }

    try {
        const parsedUrl = new URL(trimmedUrl);
        return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
    } catch {
        return trimmedUrl;
    }
}

function isNotFoundError(error: unknown) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const maybeError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return maybeError.name === "NotFound" || maybeError.$metadata?.httpStatusCode === 404;
}

async function streamToBuffer(body: unknown) {
    if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) {
        throw new Error("Resposta do S3 sem stream legivel.");
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
        if (Buffer.isBuffer(chunk)) {
            chunks.push(chunk);
            continue;
        }

        if (typeof chunk === "string") {
            chunks.push(Buffer.from(chunk));
            continue;
        }

        chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
}

function shouldRepairObject(key: string, contentType?: string) {
    const extension = path.extname(key).toLowerCase();
    if (HEIC_EXTENSIONS.has(extension)) {
        return true;
    }

    if (!contentType) {
        return false;
    }

    return HEIC_MIME_TYPES.has(contentType.toLowerCase());
}

function buildBackupKey(backupPrefix: string, sourceKey: string) {
    return `${backupPrefix}/${sourceKey.replace(/^\/+/, "")}`;
}

function buildCopySource(bucket: string, sourceKey: string) {
    const encodedKey = sourceKey
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

    return `${bucket}/${encodedKey}`;
}

async function backupOriginalObject(
    s3: S3Client,
    bucket: string,
    sourceKey: string,
    backupKey: string
) {
    try {
        await s3.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: backupKey,
        }));

        return false;
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }

    await s3.send(new CopyObjectCommand({
        Bucket: bucket,
        Key: backupKey,
        CopySource: buildCopySource(bucket, sourceKey),
    }));

    return true;
}

async function convertObjectToJpeg(s3: S3Client, bucket: string, sourceKey: string) {
    const objectResponse = await s3.send(new GetObjectCommand({
        Bucket: bucket,
        Key: sourceKey,
    }));

    const originalBuffer = await streamToBuffer(objectResponse.Body);
    const convertedBuffer = await sharp(originalBuffer)
        .rotate()
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();

    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: sourceKey,
        Body: convertedBuffer,
        ContentType: "image/jpeg",
        Metadata: objectResponse.Metadata,
    }));
}

function printSummary(summary: Summary, options: ScriptOptions) {
    console.log("");
    console.log("===== GalleryAfter HEIC Repair Summary =====");
    console.log(`Mode: ${options.dryRun ? "dry-run" : "execute"}`);
    console.log(`Scanned rows: ${summary.scannedRows}`);
    console.log(`Unique keys: ${summary.uniqueKeys}`);
    console.log(`Duplicate rows skipped: ${summary.duplicateRows}`);
    console.log(`Empty URLs skipped: ${summary.emptyUrls}`);
    console.log(`Candidates: ${summary.candidates}`);
    console.log(`Skipped non-HEIC keys: ${summary.skipped}`);
    console.log(`Backups created: ${summary.backupsCreated}`);
    console.log(`Existing backups reused: ${summary.backupsReused}`);
    console.log(`Objects converted: ${summary.converted}`);
    console.log(`Errors: ${summary.errors}`);
}

async function run() {
    const options = parseArgs();
    const bucket = getBucketName();
    const s3 = createS3Client();
    const seenKeys = new Set<string>();
    const summary: Summary = {
        scannedRows: 0,
        uniqueKeys: 0,
        duplicateRows: 0,
        emptyUrls: 0,
        candidates: 0,
        skipped: 0,
        backupsCreated: 0,
        backupsReused: 0,
        converted: 0,
        errors: 0,
    };

    let cursor: string | undefined;

    while (true) {
        const rows = await prisma.galleryAfter.findMany({
            select: {
                id: true,
                url: true,
            },
            orderBy: {
                id: "asc",
            },
            take: options.batchSize,
            ...(cursor
                ? {
                    cursor: { id: cursor },
                    skip: 1,
                }
                : {}),
        });

        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            summary.scannedRows++;

            const key = normalizeS3Key(row.url);
            if (!key) {
                summary.emptyUrls++;
                continue;
            }

            if (seenKeys.has(key)) {
                summary.duplicateRows++;
                continue;
            }

            seenKeys.add(key);
            summary.uniqueKeys++;

            try {
                const head = await s3.send(new HeadObjectCommand({
                    Bucket: bucket,
                    Key: key,
                }));

                if (!shouldRepairObject(key, head.ContentType)) {
                    summary.skipped++;
                    continue;
                }

                summary.candidates++;
                console.log(`${options.dryRun ? "[DRY-RUN]" : "[FIX]"} Candidate: ${key} (${head.ContentType || "unknown"})`);

                if (options.dryRun) {
                    continue;
                }

                const backupKey = buildBackupKey(options.backupPrefix, key);
                const createdBackup = await backupOriginalObject(s3, bucket, key, backupKey);
                if (createdBackup) {
                    summary.backupsCreated++;
                } else {
                    summary.backupsReused++;
                }

                await convertObjectToJpeg(s3, bucket, key);
                summary.converted++;
            } catch (error) {
                summary.errors++;
                console.error(`Erro ao processar ${key}:`, error);
            }
        }

        cursor = rows[rows.length - 1]?.id;
    }

    printSummary(summary, options);
}

run()
    .catch((error) => {
        console.error("Falha ao executar o reparo de HEIC do GalleryAfter:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
