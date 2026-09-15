import {
  Document,
  Packer,
  Paragraph,
  ImageRun,
  HeadingLevel,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  VerticalAlign,
} from 'docx';
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
  valueAssertions?: string[],
  databaseChecks?: string[]
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

  if (databaseChecks !== undefined) {
    children.push(
      new Paragraph({
        text: 'Database Checks',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        keepNext: true,
      })
    );
    if (databaseChecks.length === 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'All fields compared against the SOA staging table matched what was captured on screen — no discrepancies found.',
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
              text: 'The following database cross-check results were flagged — either a value mismatch between the SOA staging table and what was captured on screen, or the database check itself could not run:',
              italics: true,
              bold: true,
            }),
          ],
          spacing: { after: 150 },
        })
      );
      databaseChecks.forEach((line) => {
        const isError = /database check failed|no row found/i.test(line);
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                bold: isError,
                color: isError ? 'C00000' : undefined,
              }),
            ],
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

export interface CreationReportMetadata {
  identityName: string;
  stageKey: string;
  sourceName: string;
  lifecycle: string;
}

export interface CreationAttributeRow {
  field: string;
  generatedValue: string;
  dbValue: string;
  result: 'match' | 'mismatch' | 'skipped' | 'no_row';
}

function screenshotParagraph(imagePath: string, caption: string): Paragraph[] {
  const buffer = fs.readFileSync(imagePath);
  const dimensions = sizeOf(buffer);
  const width = MAX_WIDTH;
  const height = Math.round((dimensions.height! / dimensions.width!) * MAX_WIDTH);
  return [
    new Paragraph({
      children: [new ImageRun({ type: 'png', data: buffer, transformation: { width, height } })],
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
      keepNext: true,
    }),
    new Paragraph({
      children: [new TextRun({ text: caption, italics: true, size: 20 })],
      spacing: { after: 300 },
    }),
  ];
}

const RESULT_COLOR: Record<CreationAttributeRow['result'], string | undefined> = {
  match: '1A7F37',
  mismatch: 'C00000',
  skipped: '8A8A8A',
  no_row: 'C00000',
};

const RESULT_LABEL: Record<CreationAttributeRow['result'], string> = {
  match: 'MATCH',
  mismatch: 'MISMATCH',
  skipped: 'SKIPPED',
  no_row: 'NO ROW',
};

function headerCell(text: string): TableCell {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: '1F4E79', fill: '1F4E79' },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF' })] })],
  });
}

function dataCell(text: string, color?: string, bold?: boolean): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text, color, bold })] })],
  });
}

/**
 * Report for the identity-creation pipeline (tests/sql/create-and-insert-
 * identity.spec.ts) — separate from buildReport() above, which is the
 * multi-page documentation report for the existing (unmodified) UI-based
 * regression suite. This one is purpose-built for two SSMS screenshots
 * (INSERT, verification SELECT) plus an actual Word table of every
 * generated field vs. what landed in the DB — not just images, per request,
 * so the field-by-field result is readable as a table, not just a picture
 * of one.
 */
export async function buildIdentityCreationReport(
  metadata: CreationReportMetadata,
  insertScreenshotPath: string,
  selectScreenshotPath: string,
  attributeRows: CreationAttributeRow[],
  outputPath: string
) {
  const generatedTimestamp = new Date().toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: `${metadata.sourceName} — Identity Creation`, bold: true, size: 44 })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Identity: ', bold: true }), new TextRun({ text: metadata.identityName })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Stage Key: ', bold: true }), new TextRun({ text: metadata.stageKey })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Lifecycle: ', bold: true }), new TextRun({ text: metadata.lifecycle })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Generated: ', bold: true }), new TextRun({ text: generatedTimestamp })],
      spacing: { after: 400 },
    }),
    new Paragraph({
      text: '1. SSMS — INSERT',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 200 },
      keepNext: true,
    }),
    ...screenshotParagraph(insertScreenshotPath, 'Full SSMS window immediately after the INSERT executed.'),
    new Paragraph({
      text: '2. SSMS — Verification SELECT',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 },
      keepNext: true,
    }),
    ...screenshotParagraph(selectScreenshotPath, 'Full SSMS window showing the newly-inserted row.'),
    new Paragraph({
      text: '3. Generated Attributes',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 150 },
      keepNext: true,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Every generated field, compared against what was actually read back from My_Rush_Jobs after the INSERT:',
          italics: true,
        }),
      ],
      spacing: { after: 150 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [headerCell('Field'), headerCell('Generated Value'), headerCell('My_Rush_Jobs Value'), headerCell('Result')],
        }),
        ...attributeRows.map(
          (row) =>
            new TableRow({
              children: [
                dataCell(row.field),
                dataCell(row.generatedValue),
                dataCell(row.dbValue),
                dataCell(RESULT_LABEL[row.result], RESULT_COLOR[row.result], row.result !== 'match' && row.result !== 'skipped'),
              ],
            })
        ),
      ],
    }),
  ];

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log(`Creation report saved: ${outputPath}`);
}