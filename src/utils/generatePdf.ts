import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

interface TableRow {
    id: number;
    date: string;
    productOrService: string;
    description: string;
    qty: number;
    rate: number;
    amount: number;
}

interface DataProps {
    tableData: TableRow[];
    total: string;
    columnText1: string[];
    columnText2: string[];
}

const fontSize = 10;

// Função para carregar imagem localmente no backend
const loadImageAsUint8Array = (filePath: string): Uint8Array => {
    const imageBuffer = fs.readFileSync(filePath);
    return new Uint8Array(imageBuffer);
};

export async function generatePdf(data: DataProps, clientName: string): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    // Adicionar página
    const addPage = (): PDFPage => {
        const page = pdfDoc.addPage([600, 800]);
        page.setFontSize(fontSize);
        page.setFont(timesRomanFont);
        return page;
    };

    let page = addPage();

    // Carrega a imagem local
    const imagePath = path.join(__dirname, '../../public/pdf/captura.png');
    const imageBytes = loadImageAsUint8Array(imagePath);
    const image = await pdfDoc.embedPng(imageBytes);
    const imageDims = image.scale(0.5);

    // Cabeçalho
    const addHeader = (page: PDFPage) => {
        page.drawText("ESTIMATE", { x: 50, y: 750, size: 16, color: rgb(0, 0, 1) });
        page.drawText("RP PRO CONTRACTION, LLC", { x: 50, y: 735, size: fontSize, color: rgb(0, 0, 0) });
        page.drawText("7 Hansom Dr", { x: 50, y: 725, size: fontSize, color: rgb(0, 0, 0) });
        page.drawText("Merrimack, NH 03054", { x: 50, y: 715, size: fontSize, color: rgb(0, 0, 0) });

        page.drawImage(image, { x: 370, y: 680, width: imageDims.width, height: imageDims.height });

        const contactText = [
            "info@rpprocontracting.com",
            "+1 (603) 557-2292",
            "http://www.rpprocontracting.com",
        ];
        contactText.forEach((line, index) => {
            page.drawText(line, {
                x: 230,
                y: 737 - index * 11,
                size: fontSize,
                font: timesRomanFont,
                color: rgb(0, 0, 0),
            });
        });
    };

    addHeader(page);

    // Função de quebra de texto (igual ao front)
    const wrapText = (text: string, maxWidth: number) => {
        const words = text.replace(/\n/g, ' \n ').split(' ');
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

    // Sessão das colunas (nome, endereço, etc.)
    const initialY = 630;
    const textInitialY = initialY + 30;
    const spacing = 6;
    let currentLocY = textInitialY;

    const maxItems = Math.max(data.columnText1.length, data.columnText2.length);
    const renderedItems: {
        wrappedText1: string[];
        wrappedText2: string[];
        linesCount: number;
    }[] = [];

    for (let i = 0; i < maxItems; i++) {
        const text1 = data.columnText1[i] || "";
        const text2 = data.columnText2[i] || "";
        const wrappedText1 = wrapText(text1, 150); // usa a função wrapText já definida
        const wrappedText2 = wrapText(text2, 150);
        const linesCount = Math.max(wrappedText1.length, wrappedText2.length);
        renderedItems.push({ wrappedText1, wrappedText2, linesCount });
        // Atualiza o currentY para cada item
        currentLocY -= linesCount * fontSize + spacing;
    }

    // Agora, definimos o retângulo com altura dinâmica
    const rectangleTop = textInitialY + 25;      // margem superior (pode ajustar)
    const rectangleBottom = currentLocY - 0;         // margem inferior
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

    // Seção da Tabela
    const marginX = 50;

    const tableHeaders = [
        { text: '#', x: 50 },
        { text: 'Product or Service', x: 80 },
        { text: 'Description', x: 180 },
        { text: 'Qty', x: 400 },
        { text: 'Rate', x: 450 },
        { text: 'Amount', x: 500 },
    ];

    let tableY = 480;

    // Desenha os cabeçalhos da tabela
    tableHeaders.forEach(header => {
        page.drawText(header.text, {
          x: header.x,
          y: tableY,
          size: fontSize,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });
      });

    // Linha horizontal abaixo do cabeçalho
    page.drawLine({
        start: { x: marginX, y: tableY - spacing / 2 },
        end: { x: 550, y: tableY - spacing / 2 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
    });

    // Função para adicionar nova página na tabela
    const addNewPageAndContinueTable = () => {
        page = addPage();
        tableY = 750;
    };

    let currentY = tableY - spacing - spacing;

    // Renderiza as linhas da tabela
    data.tableData.forEach((row) => {
        // Quebra de texto para "Product or Service" (80) e "Description" (150)
        const productLines = wrapText(row.productOrService, 80);
        const descriptionLines = wrapText(row.description, 150);
        const maxLines = Math.max(productLines.length, descriptionLines.length, 1);
        const rowHeight = maxLines * fontSize + spacing;

        // Nova página se não couber
        if (currentY - rowHeight < 50) {
            addNewPageAndContinueTable();
            currentY = 750 - spacing;
        }

        // Offsets de centralização vertical
        const offsetSingle = (rowHeight - fontSize) / 2;
        const offsetProduct = (rowHeight - productLines.length * fontSize) / 2;
        const offsetDescription = (rowHeight - descriptionLines.length * fontSize) / 2;

        // Coluna "#"
        page.drawText(row.id.toString(), {
            x: 50,
            y: currentY - offsetSingle,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
        });

        // Coluna "Product or Service"
        productLines.forEach((line, index) => {
            page.drawText(line, {
                x: 80,
                y: currentY - offsetProduct - (index * fontSize),
                size: fontSize,
                font: timesRomanFont,
                color: rgb(0, 0, 0),
            });
        });

        // Coluna "Description"
        descriptionLines.forEach((line, index) => {
            page.drawText(line, {
                x: 180,
                y: currentY - offsetDescription - (index * fontSize),
                size: fontSize,
                font: timesRomanFont,
                color: rgb(0, 0, 0),
            });
        });

        // Colunas "Qty", "Rate", "Amount"
        page.drawText(row.qty.toString(), {
            x: 400,
            y: currentY - offsetSingle,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
        });

        page.drawText(row.rate.toFixed(2), {
            x: 450,
            y: currentY - offsetSingle,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
        });

        page.drawText(row.amount.toFixed(2), {
            x: 500,
            y: currentY - offsetSingle,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
        });

        // Linha horizontal para separar
        page.drawLine({
            start: { x: marginX, y: currentY - rowHeight + spacing / 2 },
            end: { x: 550, y: currentY - rowHeight + spacing / 2 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
        });

        currentY -= rowHeight + spacing;
    });

    // Se não couber no final
    if (currentY < 50) {
        addNewPageAndContinueTable();
        currentY = 750 - spacing;
    }

    // Sessão do Total
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

    // Texto final (nota ao cliente)
    const noteText = `
  Note to customer
1. Deposit - A non-refundable deposit of 30% is due upon signing
this agreement to secure the project start date

2. Final Payment - The final payment of any remaining balance will be
due upon completion of the project and satisfactory inspection by
the client.

3. Payment Method - Payments can be made via cash, check, credit
card (3% fee), or electronic transfer.

4. Additional Costs - Any additional costs incurred due to changes in
project scope will be discussed and agreed upon in writing before
implementation.

5. Warranty - Our company provides a 3-year warranty on labor and
materials used in the project.

6. Acceptance - By signing this estimate, the client acknowledges
and agrees to the terms and conditions outlined as a binding
agreement.

We are fully insured, should you require any proof of insurance
please feel free to ask.
  `;

    // Renderizar o texto final com quebra de linha
    let noteY = currentY - 60;
    const noteLines = wrapText(noteText, 500);

    noteLines.forEach((line) => {
        if (noteY < 50) {
            addNewPageAndContinueTable();
            noteY = 750 - spacing;
        }
        page.drawText(line, {
            x: 50,
            y: noteY,
            size: fontSize - 2,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
        });
        noteY -= fontSize;
    });

    // Salvar o PDF na pasta temporária
    const pdfBytes = await pdfDoc.save();
    const filePath = path.join(__dirname, `../../public/pdf/${clientName.replace(/\s+/g, '_')}_estimate.pdf`);

    fs.writeFileSync(filePath, pdfBytes);
    return filePath;
}
