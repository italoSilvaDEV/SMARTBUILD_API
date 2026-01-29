import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getPresignedUrl } from './S3/getPresignedUrl';
import { v4 as uuidv4 } from 'uuid';

interface TableRow {
    id: number;
    date: string;
    productOrService: string;
    description: string;
    qty: number;
    rate: number;
    amount: number;
    photos?: { uri: string }[];
}

interface DataProps {
    tableData: TableRow[];
    total: string;
    columnText1: string[];
    columnText2: string[];
    address: string;      // ex: "Rua X, Bairro Y, Complemento Z, Número W"
    logoUrl?: string;     // URL dinâmica do logo/avatar da empresa
    notes: string[];      // array de notas
    phone: string;
    email: string;
    webSiteUrl: string;
    name: string;
    isFromContract?: boolean;
    hideRateColumns?: boolean;
    documentType?: 'ESTIMATE' | 'INVOICE';
}

const fontSize = 10;

// Função para sanitizar o texto antes de adicioná-lo ao PDF
const sanitizeText = (text: string): string => {
  if (!text) return '';
  
  // Substituir tabulações por espaços
  let sanitized = text.replace(/\t/g, '    ');
  
  // Substituir outros caracteres problemáticos
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  return sanitized;
};

// Função para carregar imagem localmente no backend
const loadLocalImageAsUint8Array = (filePath: string): Uint8Array => {
    const imageBuffer = fs.readFileSync(filePath);
    return new Uint8Array(imageBuffer);
};

export async function generatePdf(data: DataProps, clientName: string, returnPath: boolean = false): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    pdfDoc.setTitle(`Estimate`);
    pdfDoc.setAuthor(data.name);
    pdfDoc.setSubject("Contract Estimate");
    pdfDoc.setKeywords(["Estimate", "Contract"]);
    pdfDoc.setCreator("pdf-lib (https://github.com/Hopding/pdf-lib)");
    pdfDoc.setProducer("pdf-lib");

    // Função para quebrar texto em linhas
    const wrapText = (
      text: string,
      maxWidth: number,
    ) => {
      // Sanitizar o texto antes de processá-lo
      const sanitizedText = sanitizeText(text);
      
      const words = sanitizedText.replace(/\n/g, ' \n ').split(' ');
      let lines: string[] = [];
      let line = '';
      for (let word of words) {
        if (word === '\n') {
          lines.push(line.trim());
          line = '';
          continue;
        }
        let testLine = line + word + ' ';
        let testWidth = timesRomanFont.widthOfTextAtSize(testLine, fontSize);
        if (testWidth > maxWidth) {
          lines.push(line.trim());
          line = word + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());
      return lines;
    };

    // Adicionar página
    const addPage = (): PDFPage => {
        const page = pdfDoc.addPage([600, 800]);
        page.setFontSize(fontSize);
        page.setFont(timesRomanFont);
        return page;
    };

    let page = addPage();

    // Adicionar estas declarações próximo ao início da função (após as funções auxiliares)
    const notesIndent = 10;
    let notesY = 0;

    // --- LOGO ---
    if (data.logoUrl) {
        try {
            const response = await fetch(data.logoUrl);
            if (!response.ok) {
                throw new Error(`Failed to load logo from URL: ${data.logoUrl}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            // Converter a imagem (que pode estar em WebP) para PNG usando Sharp
            const pngBuffer = await sharp(buffer).png().toBuffer();
            // Embutir a imagem PNG no PDF
            const logoImage = await pdfDoc.embedPng(pngBuffer);

            // limites máximos para a logo
            const maxLogoWidth = 100;
            const maxLogoHeight = 100;

            // dimensões originais da imagem
            const originalWidth = logoImage.width;
            const originalHeight = logoImage.height;

            // fator de escala para manter a proporção
            const scaleFactor = Math.min(
                maxLogoWidth / originalWidth,
                maxLogoHeight / originalHeight,
                1 // não ampliar se a imagem for menor
            );

            const logoWidth = originalWidth * scaleFactor;
            const logoHeight = originalHeight * scaleFactor;

            // Calcular posição do logo alinhado à direita com margem de 50
            const pageWidth = 600;
            const marginRight = 50;
            const logoX = pageWidth - logoWidth - marginRight;

            page.drawImage(logoImage, {
                x: logoX,
                y: 700,
                width: logoWidth,
                height: logoHeight,
            });
        } catch (error) {
            // console.error("Error loading logo from URL:", error);
        }
    }

    // --- HEADER ---
    const addHeader = (page: PDFPage) => {
      // Usar o parâmetro documentType para determinar o título, com fallback para "ESTIMATE"
      const documentTitle = data.documentType || "ESTIMATE";
      
      page.drawText(documentTitle, {
        x: 50,
        y: 750,
        size: 16,
        color: rgb(0, 0, 1)
      });

      page.drawText(data.name, {
        x: 50,
        y: 735,
        size: fontSize,
        color: rgb(0, 0, 0)
      });

      // Endereço
      const addressLines = wrapText(data.address, 120);
      let currentAddressY = 725;
      addressLines.forEach((line) => {
        page.drawText(line, {
          x: 50,
          y: currentAddressY,
          size: fontSize,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });
        currentAddressY -= fontSize;
      });

      // Contatos
      const contactText = [
        data.email,
        data.phone,
        data.webSiteUrl,
      ].filter(Boolean);

      contactText.forEach((line, index) => {
        if (line) {
          page.drawText(line, {
            x: 230,
            y: 737 - index * 11,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
          });
        }
      });
    };

    addHeader(page);

    // --- CAMPOS DE CABEÇALHO COM BACKGROUND ---
    // Valores iniciais
    const initialY = 630;
    const textInitialY = initialY + 30;
    const spacing = 6; // Espaçamento extra entre cada item
    let currentLocY = textInitialY;

    // Primeiro, processamos os dados para as duas colunas para determinar a altura total necessária.
    const maxItems = Math.max(data.columnText1.length, data.columnText2.length);
    const renderedItems: {
      wrappedText1: string[];
      wrappedText2: string[];
      linesCount: number;
    }[] = [];

    for (let i = 0; i < maxItems; i++) {
      const text1 = data.columnText1[i] || "";
      const text2 = data.columnText2[i] || "";
      const wrappedText1 = wrapText(text1, 150);
      const wrappedText2 = wrapText(text2, 150);
      const linesCount = Math.max(wrappedText1.length, wrappedText2.length);
      renderedItems.push({ wrappedText1, wrappedText2, linesCount });
      // Atualiza o currentY para cada item
      currentLocY -= linesCount * fontSize + spacing;
    }

    // Agora, definimos o retângulo com altura dinâmica
    const rectangleTop = textInitialY + 25;      // margem superior
    const rectangleBottom = currentLocY - 0;     // margem inferior
    const rectangleHeight = rectangleTop - rectangleBottom;

    page.drawRectangle({
      x: 0,
      y: rectangleBottom,
      width: 600,
      height: rectangleHeight,
      color: rgb(0.89, 0.97, 1),
    });

    // Agora, renderizamos os textos das duas colunas dentro do retângulo
    let renderY = textInitialY;
    renderedItems.forEach(({ wrappedText1, wrappedText2, linesCount }) => {
      // Para cada item, desenhamos todas as linhas, garantindo que ambas as colunas fiquem alinhadas
      for (let i = 0; i < linesCount; i++) {
        const line1 = wrappedText1[i] || "";
        const line2 = wrappedText2[i] || "";
        page.drawText(line1, {
          x: 50,
          y: renderY - i * fontSize,
          size: fontSize,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });
        page.drawText(line2, {
          x: 300,
          y: renderY - i * fontSize + 3,
          size: fontSize,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });
      }
      // Atualiza a posição para o próximo item
      renderY -= linesCount * fontSize + spacing;
    });

    // --- TABELA DE ITENS ---
    const marginX = 50;
    
    // Definir os cabeçalhos da tabela com base no parâmetro hideRateColumns
    const tableHeaders = data.hideRateColumns 
      ? [
          { text: "Product or Service", x: 50, width: 350 },
          { text: "Amount", x: 500, width: 80 }
        ]
      : [
          { text: "Product or Service", x: 50, width: 280 },
          { text: "Qty", x: 340, width: 50 },
          { text: "Rate", x: 400, width: 80 },
          { text: "Amount", x: 500, width: 80 }
        ];

    let tableY = 480;
    tableHeaders.forEach(header => {
      page.drawText(header.text, {
        x: header.x,
        y: tableY,
        size: fontSize,
        font: timesRomanFont,
        color: rgb(0, 0, 0),
      });
    });

    // Linha horizontal logo abaixo do cabeçalho
    page.drawLine({
      start: { x: marginX, y: tableY - spacing / 2 },
      end: { x: 550, y: tableY - spacing / 2 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    const addNewPageAndContinueTable = () => {
      page = addPage();
      // addHeader(page);
      currentY = 700;
      
      // Definir um valor padrão para rowHeight nesta função
      const rowHeight = fontSize + spacing;
      
      currentY -= rowHeight + spacing;
    };

    let currentY = tableY - spacing - spacing;
    data.tableData.forEach((row) => {
      // Calcula quantas linhas são necessárias para as colunas "Product" e "Description"
      const productServiceLines = wrapText(row.productOrService, data.hideRateColumns ? 340 : 270);
      const rowHeight = Math.max(productServiceLines.length * fontSize, fontSize) + spacing;
      const offsetSingle = fontSize / 2;
      const offsetProductService = (rowHeight - productServiceLines.length * fontSize) / 2;

      // Desenha as células de linha única
      productServiceLines.forEach((line, index) => {
        page.drawText(line, {
          x: 50,
          y: currentY - offsetProductService - (index * fontSize),
          size: fontSize,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });
      });

      // Desenhar as colunas Qty e Rate apenas se não estiver ocultando
      if (!data.hideRateColumns) {
        page.drawText(row.qty.toString(), {
          x: 340,
          y: currentY - offsetSingle,
          size: fontSize,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });

        page.drawText(row.rate.toFixed(2), {
          x: 400,
          y: currentY - offsetSingle,
          size: fontSize,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });
      }

      page.drawText(row.amount.toFixed(2), {
        x: 500,
        y: currentY - offsetSingle,
        size: fontSize,
        font: timesRomanFont,
        color: rgb(0, 0, 0),
      });

      // Linha horizontal para separar a linha da próxima
      page.drawLine({
        start: { x: marginX, y: currentY - rowHeight + spacing / 2 },
        end: { x: 550, y: currentY - rowHeight + spacing / 2 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });

      currentY -= rowHeight + spacing;
    });

    // Se ficar pouco espaço, cria nova página
    if (currentY < 50) {
      addNewPageAndContinueTable();
      currentY = 750 - spacing;
    }

    // --- TOTAL ---
    page.drawText('Total', {
      x: 350,
      y: currentY - 20,
      size: fontSize,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    page.drawText(data.total, {
      x: 500,
      y: currentY - 20,
      size: fontSize,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: { x: 350, y: currentY - 30 },
      end: { x: 550, y: currentY - 30 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });

    currentY -= 60;
    
    // --- DESCRIÇÕES DOS SERVIÇOS ---
    // Adicionar nova página para as descrições
    page = addPage();
    currentY = 750;
    
    // Título da seção de descrições
    page.drawText("Description", {
      x: 50,
      y: currentY,
      size: 14,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });
    currentY -= 30;
    
    // Listar cada serviço com sua descrição
    data.tableData.forEach((row, index) => {
      if (currentY < 100) {
        page = addPage();
        currentY = 750;
      }
      
      // Número e nome do serviço
      page.drawText(`${index + 1}. ${row.productOrService}`, {
        x: 50,
        y: currentY,
        size: fontSize,
        font: timesBoldFont,
        color: rgb(0, 0, 0)
      });
      currentY -= fontSize + 5;
      
      // Descrição do serviço
      if (row.description && row.description.trim() !== "") {
        const descriptionLines = wrapText(row.description, 450);
        
        descriptionLines.forEach((line) => {
          if (currentY < 50) {
            page = addPage();
            currentY = 750;
          }
          
          // Sanitizar a linha antes de adicioná-la ao PDF
          const sanitizedLine = sanitizeText(line);
          
          page.drawText(sanitizedLine, {
            x: 70, // Indentado
            y: currentY,
            size: fontSize - 1,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
          });
          
          currentY -= fontSize;
        });
      }
      
      // Espaço entre serviços
      currentY -= 20;
    });

    // --- FOTOS ---
    // Verificar se há fotos antes de adicionar a seção
    const hasPhotos = data.tableData.some(service => 
      service.photos && service.photos.length > 0
    );

    if (hasPhotos) {
      // Após a seção de descrições, sempre iniciar uma nova página para as fotos
      page = addPage();
      currentY = 750;

      // Insere o título "photo attachment"
      page.drawText("Photo attachment", {
        x: 50,
        y: currentY,
        size: 12,
        font: timesRomanFont,
        color: rgb(0, 0, 0),
      });

      currentY -= 20;

      // Agrupar imagens por serviço
      const imagesByService: { [serviceId: number]: TableRow } = {};
      data.tableData.forEach(service => {
        if (service.photos && service.photos.length > 0) {
          imagesByService[service.id] = service;
        }
      });

      // Renderizar imagens por serviço
      for (const serviceId in imagesByService) {
        const service = imagesByService[serviceId];
        
        // Adicionar o nome do serviço
        page.drawText(service.productOrService, {
          x: 50 + notesIndent,
          y: currentY,
          size: fontSize,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });

        currentY -= 20;

        // Configurações comuns para imagens
        const imagesPerRow = 3;
        const maxImageWidth = 150;
        const maxImageHeight = 100;
        const horizontalSpacing = 20;

        for (let i = 0; i < (service.photos?.length || 0); i++) {
          if (currentY < 100) {
            page = addPage();
            notesY = 750;
          }

          try {
            const imageUrl = await getPresignedUrl(service.photos![i].uri);
            const response = await fetch(imageUrl);
            const imageBuffer = await response.arrayBuffer();
            
            // Converter para PNG usando sharp
            const pngBuffer = await sharp(Buffer.from(imageBuffer))
                .png()
                .toBuffer();
            
            const image = await pdfDoc.embedPng(pngBuffer);

            const scaleFactor = Math.min(
                maxImageWidth / image.width,
                maxImageHeight / image.height,
                1
            );

            const width = image.width * scaleFactor;
            const height = image.height * scaleFactor;

            const xPosition = 50 + (i % imagesPerRow) * (maxImageWidth + horizontalSpacing);

            if (i > 0 && i % imagesPerRow === 0) {
                currentY -= maxImageHeight + 20;
            }

            page.drawImage(image, {
                x: xPosition + notesIndent,
                y: currentY - height,
                width,
                height,
            });

          } catch (error) {
            // console.error("Erro ao carregar imagem:", error);
          }
        }
        currentY -= maxImageHeight + 40;
      }
    }

    // --- NOTAS --- (Movida para depois da seção de fotos)
    if (data.notes && data.notes.length > 0) {
      // Iniciar uma nova página para as notas
      page = addPage();
      currentY = 750;

      // Título da seção de notas
      page.drawText("Notes", {
        x: 50,
        y: currentY,
        size: 14,
        font: timesRomanFont,
        color: rgb(0, 0, 0),
      });
      currentY -= 30;

      // Notas
      data.notes.forEach((note) => {
        // Verificar se precisa adicionar uma nova página
        if (currentY < 100) {
          page = addPage();
          currentY = 750;
        }

        // Processar a nota (sanitizar e quebrar linhas longas)
        const noteSanitized = sanitizeText(note);
        const noteLines = wrapText(noteSanitized, 450);

        // Adicionar cada linha da nota
        noteLines.forEach((line) => {
          if (currentY < 50) {
            page = addPage();
            currentY = 750;
          }

          page.drawText(line, {
            x: 50 + notesIndent,
            y: currentY,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
          });

          currentY -= fontSize + 2;
        });

        // Adicionar espaço entre notas
        currentY -= 10;
      });
    }

    // Salvar o PDF
    const pdfBytes = await pdfDoc.save();
    
    // Gerar um nome de arquivo único
    const uniqueId = uuidv4();
    const fileName = `${clientName.replace(/\s+/g, '_')}_estimate_${uniqueId}.pdf`;
    const filePath = path.join(process.cwd(), `public/tmp/estimate/${fileName}`);
    
    // Garantir que o diretório existe
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Salvar o arquivo
    fs.writeFileSync(filePath, pdfBytes);
    
    if (returnPath) {
        return filePath;
    } else {
        return `/tmp/estimate/${fileName}`;
    }
}
