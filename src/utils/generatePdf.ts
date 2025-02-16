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

    const addPage = (): PDFPage => {
        const page = pdfDoc.addPage([600, 800]);
        page.setFontSize(10);
        page.setFont(timesRomanFont);
        return page;
    };

    let page = addPage();

    //  Carregar imagem local no backend
    const imagePath = path.join(__dirname, '../../public/pdf/captura.png'); 
    const imageBytes = loadImageAsUint8Array(imagePath);
    const image = await pdfDoc.embedPng(imageBytes);
    const imageDims = image.scale(0.5);

    const addHeader = (page: PDFPage) => {
        page.drawText('ESTIMATE', { x: 50, y: 750, size: 16, color: rgb(0, 0, 1) });
        page.drawText('RP PRO CONTRACTION, LLC', { x: 50, y: 735, size: 10, color: rgb(0, 0, 0) })
        page.drawText('7 Hansom Dr', { x: 50, y: 725, size: 10, color: rgb(0, 0, 0) })
        page.drawText('Merrimack, NH 03054', { x: 50, y: 715, size: 10, color: rgb(0, 0, 0) })

        page.drawImage(image, { x: 370, y: 680, width: imageDims.width, height: imageDims.height });

        const contactText = [
            'info@rpprocontracting.com',
            '+1 (603) 557-2292',
            'http://www.rpprocontracting.com'
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

    const initialY = 630;
    const textInitialY = initialY + 30;
    const spacing = 14;

    page.drawRectangle({
        x: 0,
        y: initialY - spacing * 4,
        width: 600,
        height: spacing * 6 + 20,
        color: rgb(0.89, 0.97, 1),
    });

    const wrapTextStandard = (text: string, maxWidth: number) => {
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

    data.columnText1.forEach((text, index) => {
        const wrappedText = wrapTextStandard(text, 150);
        wrappedText.forEach((line, lineIndex) => {
            page.drawText(line, {
                x: 50,
                y: textInitialY - (index * spacing) - (lineIndex * fontSize),
                size: 10,
                font: timesRomanFont,
                color: rgb(0, 0, 0),
            });
        });
    });

    data.columnText2.forEach((text, index) => {
        const wrappedText = wrapTextStandard(text, 150);
        wrappedText.forEach((line, lineIndex) => {
            page.drawText(line, {
                x: 300,
                y: textInitialY - (index * spacing) - (lineIndex * fontSize),
                size: 10,
                font: timesRomanFont,
                color: rgb(0, 0, 0),
            });
        });
    });

    //  Adicionar Tabela
    const tableHeaders = [
        { text: '#', x: 50 },
        // { text: 'Date', x: 80 },
        { text: 'Product or Service', x: 140 },
        { text: 'Description', x: 240 },
        { text: 'Qty', x: 400 },
        { text: 'Rate', x: 450 },
        { text: 'Amount', x: 500 },
    ];

    let tableY = 480;
    page.drawLine({ start: { x: 50, y: tableY - 5 }, end: { x: 550, y: tableY - 5 }, thickness: 1, color: rgb(0, 0, 0) });

    tableHeaders.forEach(header => {
        page.drawText(header.text, {
            x: header.x,
            y: tableY,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
        });
    });

    let currentY = tableY - spacing - spacing;

    data.tableData.forEach((row) => {
        const rowHeight = 20;

        if (currentY - rowHeight < 50) {
            page = addPage();
            currentY = 750 - spacing;
        }

        page.drawText(row.id.toString(), { x: 50, y: currentY, size: fontSize, font: timesRomanFont });
        page.drawText(row.productOrService, { x: 140, y: currentY, size: fontSize, font: timesRomanFont });
        page.drawText(row.description, { x: 240, y: currentY, size: fontSize, font: timesRomanFont });
        page.drawText(row.qty.toString(), { x: 400, y: currentY, size: fontSize, font: timesRomanFont });
        page.drawText(row.rate.toFixed(2), { x: 450, y: currentY, size: fontSize, font: timesRomanFont });
        page.drawText(row.amount.toFixed(2), { x: 500, y: currentY, size: fontSize, font: timesRomanFont });

        // Linha horizontal
        page.drawLine({ start: { x: 50, y: currentY - 5 }, end: { x: 550, y: currentY - 5 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

        currentY -= rowHeight + spacing;
    });

    page.drawText(`Total:`, { x: 350, y: currentY - 20, size: 12, color: rgb(0, 0, 0) });
    page.drawText(`${data.total}`, { x: 500, y: currentY - 20, size: 12, color: rgb(0, 0, 0) });
    page.drawLine({
        start: { x: 350, y: currentY - 30 },
        end: { x: 550, y: currentY - 30 },
        thickness: 0.5,
        color: rgb(0, 0, 0),
    })

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

  const addNewPageAndContinueTable = () => {
    page = addPage();
    tableY = 750;
};

const wrapText = (text: string, maxWidth: number) => {
    const paragraphs = text.split("\n"); // Mantém parágrafos separados
    let lines: string[] = [];

    paragraphs.forEach((paragraph) => {
        if (paragraph.trim() === "") {
            lines.push(""); // Mantém espaçamentos entre seções
            return;
        }

        let words = paragraph.split(" ");
        let line = "";

        words.forEach((word) => {
            let testLine = line + word + " ";
            let testWidth = timesRomanFont.widthOfTextAtSize(testLine, fontSize);
            if (testWidth > maxWidth) {
                lines.push(line.trim());
                line = word + " ";
            } else {
                line = testLine;
            }
        });

        lines.push(line.trim()); // Adiciona a última linha do parágrafo
    });

    return lines;
};

const noteLines = wrapText(noteText, 500);
let noteY = currentY - 60;

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
