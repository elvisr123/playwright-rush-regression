import { Document, Packer, Paragraph, ImageRun, HeadingLevel, TextRun, AlignmentType } from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import sizeOf from 'image-size';

interface ReportImage {
  path: string;
  caption?: string;
}

interface ReportSection {
  title: string;
  note?: string;
  images: ReportImage[];
}

interface ReportMetadata {
  sourceLabel: string;
  identityName: string;
  caseId: string;
}

const MAX_WIDTH = 480;

export async function buildReport(
  metadata: ReportMetadata,
  sections: ReportSection[],
  outputPath: string,
  checkedSummary?: string[],
  blankFieldsSummary?: string[],
  correlationMismatches?: string[],
  valueAssertions?: string[]
) {
  const generatedTimestamp = new Date().toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });

  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: `${metadata.sourceLabel} — Identity Validation`, bold: true, size: 44 })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Identity: ', bold: true }), new TextRun({ text: metadata.identityName })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Case ID: ', bold: true }), new TextRun({ text: metadata.caseId })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Generated: ', bold: true }), new TextRun({ text: generatedTimestamp })],
      spacing: { after: 400 },
    }),
  ];

  if (checkedSummary && checkedSummary.length > 0) {
    children.push(
      new Paragraph({
        text: 'What Was Checked',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 100, after: 150 },
        keepNext: true,
      })
    );
    checkedSummary.forEach((line) => {
      children.push(
        new Paragraph({
          text: line,
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
    });
    children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
  }

  sections.forEach((section, index) => {
    children.push(
      new Paragraph({
        text: `${index + 1}. ${section.title}`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
        keepNext: true,
      })
    );

    if (section.note) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: section.note, italics: true })],
          spacing: { after: 200 },
        })
      );
    }

    section.images.forEach((image) => {
      const buffer = fs.readFileSync(image.path);
      const dimensions = sizeOf(buffer);
      const width = MAX_WIDTH;
      const height = Math.round((dimensions.height! / dimensions.width!) * MAX_WIDTH);

      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: 'png',
              data: buffer,
              transformation: { width, height },
            }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { after: 100 },
          keepNext: !!image.caption,
        })
      );
      if (image.caption) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: image.caption, italics: true, size: 20 })],
            spacing: { after: 300 },
          })
        );
      }
    });
  });

  if (valueAssertions !== undefined && valueAssertions.length > 0) {
    children.push(
      new Paragraph({
        text: 'Value Assertions',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        keepNext: true,
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Expected values from the test case specification, checked against what was actually captured on this run:',
            italics: true,
          }),
        ],
        spacing: { after: 150 },
      })
    );
    valueAssertions.forEach((line) => {
      const isFail = line.startsWith('FAIL');
      const isNotFound = line.startsWith('NOT FOUND');
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              bold: isFail,
              color: isFail ? 'C00000' : isNotFound ? 'B8860B' : undefined,
            }),
          ],
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
    });
  }

  if (correlationMismatches !== undefined) {
    children.push(
      new Paragraph({
        text: 'Correlation Key Check',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        keepNext: true,
      })
    );
    if (correlationMismatches.length === 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Correlation Key matched the Identity Details page value on every source account checked.',
              italics: true,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'The following account(s) do not correlate to the same Correlation Key shown on the Identity Details page — this indicates a real correlation problem, not just a missing value:',
              italics: true,
              bold: true,
            }),
          ],
          spacing: { after: 150 },
        })
      );
      correlationMismatches.forEach((line) => {
        children.push(
          new Paragraph({
            text: line,
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        );
      });
    }
  }

  if (blankFieldsSummary !== undefined) {
    children.push(
      new Paragraph({
        text: 'Fields Found Blank',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        keepNext: true,
      })
    );
    if (blankFieldsSummary.length === 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'No blank values found among the fields checked above.', italics: true })],
          spacing: { after: 200 },
        })
      );
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'The following highlighted fields had no value on the page at capture time — not necessarily errors, but worth a second look:',
              italics: true,
            }),
          ],
          spacing: { after: 150 },
        })
      );
      blankFieldsSummary.forEach((line) => {
        children.push(
          new Paragraph({
            text: line,
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        );
      });
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log(`Report staged for SharePoint upload: ${outputPath}`);
}