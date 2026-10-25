import { describe, expect, it } from 'vitest';
import type { DetectionInput } from '../contracts';
import { documentPatternDetector } from './documentPatterns';

/** All examples are fictional. Values exercise OCR spacing, not a real person's record. */
function imageWithLines(lines: string[]): DetectionInput {
  return { imageId: 'fictional-identity-labels', imageWidth: 1800, imageHeight: 1200,
    ocr: { imageId: 'fictional-identity-labels', width: 1800, height: 1200,
      language: 'eng+chi_sim', text: lines.join('\n'),
      words: lines.flatMap((line, row) => {
        let x = 40;
        return line.split(' ').map((text, column) => {
          const width = Math.max(12, text.length * 12);
          const word = { id: `w-${row}-${column}`, lineId: `l-${row}`, text,
            confidence: 0.92, box: { x, y: 40 + row * 60, width, height: 26 } };
          x += width + 10;
          return word;
        });
      }) } };
}

describe('identity and contact labels', () => {
  it.each([
    ['性别：男', 'sex or gender', '男'],
    ['性 别 女', 'sex or gender', '女'],
    ['Sex: F', 'sex or gender', 'F'],
    ['Gender: nonbinary', 'sex or gender', 'nonbinary'],
    ['民族：汉', 'ethnicity', '汉'],
    ['民 族 汉', 'ethnicity', '汉'],
    ['Ethnic origin: Fictional example', 'ethnicity', 'Fictional example'],
    ['Surname: O', 'passport personal details', 'O'],
    ['Given name: Alex', 'passport personal details', 'Alex'],
    ['手机号码：13800000000', 'contact telephone', '13800000000'],
    ['电 话 号 码：+86 138 0000 0000', 'contact telephone', '+86 138 0000 0000'],
    ['传真号码：010-55550142', 'contact telephone', '010-55550142'],
    ['Tel.: +1 416 555 0142', 'contact telephone', '+1 416 555 0142'],
    ['Phone No. +1 416 555 0142', 'contact telephone', '+1 416 555 0142'],
    ['电子邮件：alex@example.test', 'contact email', 'alex@example.test'],
    ['E-mail: alex @ example . test', 'contact email', 'alex @ example . test'],
    ['Passport No. P8273649', 'passport number', 'P8273649'],
    ['Document No. DOC8273649', 'identity document number', 'DOC8273649'],
    ['出生 2003 年 4 月 8 日', 'birth date', '2003 年 4 月 8 日'],
    ['出 生：2003年04月08日', 'birth date', '2003年04月08日'],
    ['姓名张三', 'person name', '张三'],
  ])('finds an explicitly labeled value: %s', async (line, label, value) => {
    const findings = await documentPatternDetector.detect(imageWithLines([line]));
    const finding = findings.find(item => item.label === `Possible ${label}` && item.value === value);
    expect(finding).toBeDefined();
    expect(finding?.status).toBe('UNKNOWN_POTENTIALLY_SENSITIVE');
    expect(finding?.boxes?.length).toBeGreaterThan(0);
    expect(finding?.evidence[0]?.source).toBe('ocr');
  });

  it('keeps adjacent one-character fields separate and includes neither label in its value', async () => {
    const findings = await documentPatternDetector.detect(imageWithLines(['性 别 男 民 族 汉']));
    expect(findings.filter(item => item.label === 'Possible sex or gender').map(item => item.value)).toEqual(['男']);
    expect(findings.filter(item => item.label === 'Possible ethnicity').map(item => item.value)).toEqual(['汉']);
  });

  it('distinguishes place of birth from birth date on an identity document', async () => {
    const findings = await documentPatternDetector.detect(imageWithLines([
      '出生地：测试市 出生：2003年04月08日',
    ]));
    expect(findings.filter(item => item.label === 'Possible passport personal details').map(item => item.value)).toEqual(['测试市']);
    expect(findings.filter(item => item.label === 'Possible birth date').map(item => item.value)).toEqual(['2003年04月08日']);
  });

  it('does not return a truncated contact email from an OCR-spaced domain', async () => {
    const findings = await documentPatternDetector.detect(imageWithLines(['Email: alex @ sub . example . test Phone: +1 416 555 0142']));
    const emails = findings.filter(item => item.label === 'Possible contact email' || item.label === 'Possible email address');
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every(item => item.value === 'alex @ sub . example . test')).toBe(true);
  });

  it('does not invent identity details from labels without values or discussion text', async () => {
    const findings = await documentPatternDetector.detect(imageWithLines([
      'Sex: equality discussion', 'Gender: demographic overview', '民族：',
      'DOB: 2003-02-30', '出生 2003年02月30日', 'Email: alex@example',
    ]));
    expect(findings).toEqual([]);
  });
});
