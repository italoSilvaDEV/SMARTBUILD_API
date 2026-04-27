import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import crypto from "crypto";
import iconv from "iconv-lite";
import sharp from "sharp";
import { compressImage } from "../../config/compressImage";
// import { statusUpload } from "../../controllers/NotificationController";

const HEIC_MIME_TYPES = new Set([
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
]);
const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jfif']);

function createS3Client() {
    return new S3Client({
        region: process.env.AMAZON_S3_REGION,
        credentials: {
            accessKeyId: process.env.AMAZON_S3_KEY!,
            secretAccessKey: process.env.AMAZON_S3_SECRET!,
        },
    });
}

function decodeOriginalName(originalName: string) {
    return path.basename(iconv.decode(Buffer.from(originalName, 'binary'), 'utf-8'));
}

function sanitizeName(name: string) {
    return name.replace(/\s/g, "");
}

function buildConvertedFileName(originalName: string, hashLength: number) {
    const fileHash = crypto.randomBytes(hashLength).toString("hex");
    const decodedOriginalName = decodeOriginalName(originalName);
    const parsedName = path.parse(decodedOriginalName);
    const baseName = sanitizeName(parsedName.name || 'upload');
    return `${fileHash}-${baseName}.jpg`;
}

async function shouldConvertHeic(file: Express.Multer.File, filePath: string) {
    const mimeType = (file.mimetype || '').toLowerCase();
    const extension = path.extname(file.originalname).toLowerCase();

    if (HEIC_MIME_TYPES.has(mimeType) || HEIC_EXTENSIONS.has(extension)) {
        return true;
    }

    if (!mimeType.startsWith('image/') && !IMAGE_EXTENSIONS.has(extension)) {
        return false;
    }

    try {
        const metadata = await sharp(filePath).metadata();
        return metadata.format === 'heif';
    } catch {
        return false;
    }
}

async function convertHeicToJpegBuffer(filePath: string) {
    return await sharp(filePath)
        .rotate()
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
}

async function uploadBufferAsMultipart(
    s3: S3Client,
    bucket: string,
    fileName: string,
    contentType: string,
    buffer: Buffer
) {
    const createMultipartUploadCommand = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: fileName,
        ContentType: contentType,
    });

    const multipartUpload = await s3.send(createMultipartUploadCommand);
    const uploadId = multipartUpload.UploadId;

    if (!uploadId) {
        throw new Error('Falha ao iniciar multipart upload');
    }

    try {
        const partSize = 5 * 1024 * 1024;
        const parts: any[] = [];
        let partNumber = 1;

        for (let offset = 0; offset < buffer.length; offset += partSize) {
            const chunk = buffer.subarray(offset, offset + partSize);
            const uploadPartCommand = new UploadPartCommand({
                Bucket: bucket,
                Key: fileName,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: chunk,
            });

            const uploadPartResponse = await s3.send(uploadPartCommand);

            parts.push({
                PartNumber: partNumber,
                ETag: uploadPartResponse.ETag,
            });

            partNumber++;
        }

        const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: fileName,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
        });

        await s3.send(completeMultipartUploadCommand);
    } catch (error) {
        console.error(error);

        await s3.send(new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: fileName,
            UploadId: uploadId,
        }));

        throw error;
    }
}

async function uploadHeicIfNeeded(
    s3: S3Client,
    file: Express.Multer.File,
    filePath: string,
    hashLength: number,
    shouldDeleteFile: boolean
) {
    if (!(await shouldConvertHeic(file, filePath))) {
        return null;
    }

    const bucket = process.env.AMAZON_S3_BUCKET!;
    const convertedFileName = buildConvertedFileName(file.originalname, hashLength);
    const convertedBuffer = await convertHeicToJpegBuffer(filePath);

    await uploadBufferAsMultipart(s3, bucket, convertedFileName, 'image/jpeg', convertedBuffer);

    if (shouldDeleteFile && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    return convertedFileName;
}

// Função reutilizável para upload multipart para o S3
export async function uploadFileToS3(file: Express.Multer.File, userId: string) {
    const s3 = createS3Client();

    const fileHash = crypto.randomBytes(16).toString("hex");
    const originalName = decodeOriginalName(file.originalname);
    const fileName = `${fileHash}-${sanitizeName(originalName)}`;

    const filePath = path.resolve(file.path);
    const convertedFileName = await uploadHeicIfNeeded(s3, file, filePath, 16, true);
    if (convertedFileName) {
        return convertedFileName;
    }

    const fileStream = fs.createReadStream(filePath);

    const createMultipartUploadCommand = new CreateMultipartUploadCommand({
        Bucket: process.env.AMAZON_S3_BUCKET!,
        Key: fileName,
        ContentType: file.mimetype,
    });

    const multipartUpload = await s3.send(createMultipartUploadCommand);
    const uploadId = multipartUpload.UploadId;

    if (!uploadId) {
        throw new Error('Falha ao iniciar multipart upload');
    }

    try {
        const partSize = 5 * 1024 * 1024; // 5MB por parte , padrao da aws
        const parts: any[] = [];
        let partNumber = 1;
        let uploadedBytes = 0;
        let buffer = Buffer.alloc(0);

        for await (const chunk of fileStream) {
            buffer = Buffer.concat([buffer, chunk]);
            if (buffer.length >= partSize) {
                const uploadPartCommand = new UploadPartCommand({
                    Bucket: process.env.AMAZON_S3_BUCKET!,
                    Key: fileName,
                    UploadId: uploadId,
                    PartNumber: partNumber,
                    Body: buffer,
                });

                const uploadPartResponse = await s3.send(uploadPartCommand);

                parts.push({
                    PartNumber: partNumber,
                    ETag: uploadPartResponse.ETag,
                });

                uploadedBytes += buffer.length;

                partNumber++;
                buffer = Buffer.alloc(0);
            }
        }

        if (buffer.length > 0) {
            const uploadPartCommand = new UploadPartCommand({
                Bucket: process.env.AMAZON_S3_BUCKET!,
                Key: fileName,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: buffer,
            });

            const uploadPartResponse = await s3.send(uploadPartCommand);

            parts.push({
                PartNumber: partNumber,
                ETag: uploadPartResponse.ETag,
            });
        }

        const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
            Bucket: process.env.AMAZON_S3_BUCKET!,
            Key: fileName,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
        });

        await s3.send(completeMultipartUploadCommand);
        // statusUpload(userId, 100);
        fs.unlinkSync(filePath); // Deletar o arquivo local após o upload
        return fileName; // Retorna o nome do arquivo para armazenar no banco de dados

    } catch (error) {
        console.error(error);

        // Em caso de erro, abortar o multipart upload
        if (uploadId) {
            const abortMultipartUploadCommand = new AbortMultipartUploadCommand({
                Bucket: process.env.AMAZON_S3_BUCKET!,
                Key: file.originalname,
                UploadId: uploadId,
            });

            await s3.send(abortMultipartUploadCommand);
        }

        throw error; // Repassar o erro para ser tratado onde a função for usada
    }
}

export async function uploadFileToS3_2(
    file: Express.Multer.File,
    userId: string,
    isDeleteFile: boolean = true
) {
    const s3 = createS3Client();

    const fileHash = crypto.randomBytes(4).toString("hex");
    const originalName = decodeOriginalName(file.originalname);
    const fileName = `${fileHash}-${sanitizeName(originalName)}`;

    const filePath = path.resolve(file.path);
    const convertedFileName = await uploadHeicIfNeeded(s3, file, filePath, 4, isDeleteFile);
    if (convertedFileName) {
        return convertedFileName;
    }

    const fileStream = fs.createReadStream(filePath);

    const createMultipartUploadCommand = new CreateMultipartUploadCommand({
        Bucket: process.env.AMAZON_S3_BUCKET!,
        Key: fileName,
        ContentType: file.mimetype,
    });

    const multipartUpload = await s3.send(createMultipartUploadCommand);
    const uploadId = multipartUpload.UploadId;

    if (!uploadId) {
        throw new Error('Falha ao iniciar multipart upload');
    }

    try {
        const partSize = 5 * 1024 * 1024; // 5MB por parte , padrao da aws
        const parts: any[] = [];
        let partNumber = 1;
        let uploadedBytes = 0;
        let buffer = Buffer.alloc(0);

        for await (const chunk of fileStream) {
            buffer = Buffer.concat([buffer, chunk]);
            if (buffer.length >= partSize) {
                const uploadPartCommand = new UploadPartCommand({
                    Bucket: process.env.AMAZON_S3_BUCKET!,
                    Key: fileName,
                    UploadId: uploadId,
                    PartNumber: partNumber,
                    Body: buffer,
                });

                const uploadPartResponse = await s3.send(uploadPartCommand);

                parts.push({
                    PartNumber: partNumber,
                    ETag: uploadPartResponse.ETag,
                });

                uploadedBytes += buffer.length;

                partNumber++;
                buffer = Buffer.alloc(0);
            }
        }

        if (buffer.length > 0) {
            const uploadPartCommand = new UploadPartCommand({
                Bucket: process.env.AMAZON_S3_BUCKET!,
                Key: fileName,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: buffer,
            });

            const uploadPartResponse = await s3.send(uploadPartCommand);

            parts.push({
                PartNumber: partNumber,
                ETag: uploadPartResponse.ETag,
            });
        }

        const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
            Bucket: process.env.AMAZON_S3_BUCKET!,
            Key: fileName,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
        });

        await s3.send(completeMultipartUploadCommand);
        // statusUpload(userId, 100);
        if (isDeleteFile) {
            fs.unlinkSync(filePath); // Deletar o arquivo local após o upload
        }
        return fileName; // Retorna o nome do arquivo para armazenar no banco de dados

    } catch (error) {
        console.error(error);

        // Em caso de erro, abortar o multipart upload
        if (uploadId) {
            const abortMultipartUploadCommand = new AbortMultipartUploadCommand({
                Bucket: process.env.AMAZON_S3_BUCKET!,
                Key: file.originalname,
                UploadId: uploadId,
            });

            await s3.send(abortMultipartUploadCommand);
        }

        throw error; // Repassar o erro para ser tratado onde a função for usada
    }
}

export async function uploadImageWebpToS3(filePath: string, s3Bucket: string): Promise<string> {
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`O caminho do arquivo é inválido ou o arquivo não existe: ${filePath}`);
    }
    // Inicializa o cliente S3
    const s3 = createS3Client();

    // Compressão do arquivo (se necessário)
    compressImage(filePath);
    const fileHash = crypto.randomBytes(4).toString("hex");
    const originalName = `${filePath.split('.')[0]}.webp`.replace(/\s/g, "");
    const sanitizedOriginalName = iconv.decode(Buffer.from(String(originalName), 'binary'), 'utf-8').replace(/\s/g, '');
    const fileName = `${fileHash}-${sanitizedOriginalName}`;

    const fileStream = fs.createReadStream(filePath);

    // Inicia o multipart upload
    const createMultipartUploadCommand = new CreateMultipartUploadCommand({
        Bucket: s3Bucket,
        Key: fileName,
        ContentType: 'image/webp',
    });

    const multipartUpload = await s3.send(createMultipartUploadCommand);
    const uploadId = multipartUpload.UploadId;

    if (!uploadId) {
        throw new Error('Falha ao iniciar multipart upload');
    }

    try {
        const partSize = 5 * 1024 * 1024; // Tamanho de cada parte: 5MB
        const parts: any[] = [];
        let partNumber = 1;
        let buffer = Buffer.alloc(0);

        for await (const chunk of fileStream) {
            buffer = Buffer.concat([buffer, chunk]);
            if (buffer.length >= partSize) {
                const uploadPartCommand = new UploadPartCommand({
                    Bucket: s3Bucket,
                    Key: fileName,
                    UploadId: uploadId,
                    PartNumber: partNumber,
                    Body: buffer,
                });

                const uploadPartResponse = await s3.send(uploadPartCommand);

                parts.push({
                    PartNumber: partNumber,
                    ETag: uploadPartResponse.ETag,
                });

                partNumber++;
                buffer = Buffer.alloc(0);
            }
        }

        // Upload da última parte, caso exista
        if (buffer.length > 0) {
            const uploadPartCommand = new UploadPartCommand({
                Bucket: s3Bucket,
                Key: fileName,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: buffer,
            });

            const uploadPartResponse = await s3.send(uploadPartCommand);

            parts.push({
                PartNumber: partNumber,
                ETag: uploadPartResponse.ETag,
            });
        }

        // Concluir o multipart upload
        const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
            Bucket: s3Bucket,
            Key: fileName,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
        });

        await s3.send(completeMultipartUploadCommand);

        // Deletar o arquivo local após o upload
        fs.unlinkSync(filePath);

        return fileName; // Retorna o nome do arquivo armazenado no S3
    } catch (error) {
        console.error('Erro durante o upload multipart:', error);

        // Em caso de erro, abortar o multipart upload
        if (uploadId) {
            const abortMultipartUploadCommand = new AbortMultipartUploadCommand({
                Bucket: s3Bucket,
                Key: fileName,
                UploadId: uploadId,
            });

            await s3.send(abortMultipartUploadCommand);
        }

        throw error;
    }
}
