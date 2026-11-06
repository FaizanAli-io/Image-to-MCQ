import { extractText, getDocumentProxy } from 'unpdf';
import { pageLines, readWorksheetQuestions, type PdfPage } from './mapper-source';
import { readWorksheetMarkScheme } from './mapper-mark-scheme';

export async function readMapperPdf(buffer: Buffer, questionPaper = false) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const pages: PdfPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push({ page: number, height: page.getViewport({ scale: 1 }).height,
        items: content.items.flatMap(item => 'str' in item ? [{
          text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height,
        }] : []),
      });
    }
    const sourceQuestions = questionPaper ? readWorksheetQuestions(pages) : null;
    // Table mark schemes and unsupported layouts keep their existing text
    // representation. Only recognised question worksheets use sorted lines.
    const text = sourceQuestions
      ? pages.map(page => `[Page ${page.page}]\n${pageLines(page).map(line => line.text).join('\n')}`).join('\n')
      : await extractText(pdf).then(result => Array.isArray(result.text) ? result.text.join('\n') : result.text);
    return { text, sourceQuestions, sourceMarkingRows: questionPaper ? null : readWorksheetMarkScheme(pages) };
  } finally {
    await pdf.destroy();
  }
}
