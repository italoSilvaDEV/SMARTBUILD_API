import QRCode from 'qrcode';
import { uploadFileToS3 } from '../utils/S3/uploadFIleS3';
import fs from 'fs';
import path from 'path';

interface QRCodeOptions {
    width?: number;
    margin?: number;
    color?: {
        dark?: string;
        light?: string;
    };
}

/**
 * Gerar QR Code como Data URL (base64)
 */
export async function generateQRCodeDataURL(
    text: string, 
    options?: QRCodeOptions
): Promise<string> {
    try {
        const qrCodeOptions = {
            width: options?.width || 300,
            margin: options?.margin || 2,
            color: {
                dark: options?.color?.dark || '#000000',
                light: options?.color?.light || '#FFFFFF',
            },
        };

        const dataUrl = await QRCode.toDataURL(text, qrCodeOptions);
        return dataUrl;
    } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
        throw new Error('Falha ao gerar QR Code');
    }
}

/**
 * Gerar QR Code e fazer upload para S3
 */
export async function generateQRCodeAndUpload(
    text: string,
    filename: string,
    options?: QRCodeOptions
): Promise<string> {
    try {
        const qrCodeOptions = {
            width: options?.width || 500,
            margin: options?.margin || 2,
            color: {
                dark: options?.color?.dark || '#000000',
                light: options?.color?.light || '#FFFFFF',
            },
        };

        // Criar diretório temporário se não existir
        const tmpDir = path.join(__dirname, '../../tmp/qrcodes');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        // Gerar arquivo temporário
        const tempFilePath = path.join(tmpDir, `${filename}.png`);
        await QRCode.toFile(tempFilePath, text, qrCodeOptions);

        // Fazer upload para S3
        const file = {
            path: tempFilePath,
            originalname: `${filename}.png`,
            mimetype: 'image/png'
        } as Express.Multer.File;

        const s3Url = await uploadFileToS3(file, 'qrcodes');

        // Deletar arquivo temporário
        fs.unlinkSync(tempFilePath);

        return s3Url;
    } catch (error) {
        console.error('Erro ao gerar e fazer upload do QR Code:', error);
        throw new Error('Falha ao gerar e fazer upload do QR Code');
    }
}

/**
 * Gerar QR Code como buffer
 */
export async function generateQRCodeBuffer(
    text: string,
    options?: QRCodeOptions
): Promise<Buffer> {
    try {
        const qrCodeOptions = {
            width: options?.width || 300,
            margin: options?.margin || 2,
            color: {
                dark: options?.color?.dark || '#000000',
                light: options?.color?.light || '#FFFFFF',
            },
        };

        const buffer = await QRCode.toBuffer(text, qrCodeOptions);
        return buffer;
    } catch (error) {
        console.error('Erro ao gerar QR Code buffer:', error);
        throw new Error('Falha ao gerar QR Code buffer');
    }
}

/**
 * Gerar QR Code SVG
 */
export async function generateQRCodeSVG(
    text: string,
    options?: QRCodeOptions
): Promise<string> {
    try {
        const qrCodeOptions = {
            width: options?.width || 300,
            margin: options?.margin || 2,
            color: {
                dark: options?.color?.dark || '#000000',
                light: options?.color?.light || '#FFFFFF',
            },
        };

        const svg = await QRCode.toString(text, { 
            type: 'svg',
            ...qrCodeOptions 
        });
        return svg;
    } catch (error) {
        console.error('Erro ao gerar QR Code SVG:', error);
        throw new Error('Falha ao gerar QR Code SVG');
    }
}

/**
 * Gerar QR Code com logo/marca d'água no centro
 */
export async function generateQRCodeWithLogo(
    text: string,
    logoPath: string,
    filename: string
): Promise<string> {
    try {
        // Primeiro, gerar o QR Code
        const tmpDir = path.join(__dirname, '../../tmp/qrcodes');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const tempFilePath = path.join(tmpDir, `${filename}.png`);
        
        await QRCode.toFile(tempFilePath, text, {
            width: 600,
            margin: 2,
            errorCorrectionLevel: 'H', // Alta correção de erro para suportar logo
        });

        // TODO: Implementar overlay do logo usando sharp
        // Por ora, retornar apenas o QR Code sem logo

        const file = {
            path: tempFilePath,
            originalname: `${filename}.png`,
            mimetype: 'image/png'
        } as Express.Multer.File;

        const s3Url = await uploadFileToS3(file, 'qrcodes');
        fs.unlinkSync(tempFilePath);

        return s3Url;
    } catch (error) {
        console.error('Erro ao gerar QR Code com logo:', error);
        throw new Error('Falha ao gerar QR Code com logo');
    }
}

