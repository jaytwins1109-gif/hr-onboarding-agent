/**
 * 零依赖制度解析器单测：文本直读、docx 解包提取 <w:t>、PDF 文本流与扫描件失败原因。
 */
import { describe, expect, it } from 'vitest';
import { extractText } from '@/lib/workspace/policy-parser';

/** 用 store 方式拼一个最小 zip，模拟 docx 的 word/document.xml */
function makeZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localBuf = Buffer.concat([local, name, entry.data]);
    locals.push(localBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localBuf.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe('extractText', () => {
  it('文本文件按 UTF-8 直接读取', () => {
    expect(
      extractText(Buffer.from('第一章 目的与适用范围\r\n住宿上限 500 元', 'utf8'), 'a.txt'),
    ).toBe('第一章 目的与适用范围\n住宿上限 500 元');
  });

  it('docx 提取段落与 XML 实体', () => {
    const xml =
      '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>报销标准 &amp; 上限</w:t></w:r></w:p><w:p><w:r><w:t>一线城市 500 元</w:t></w:r></w:p></w:body></w:document>';
    const buf = makeZip([{ name: 'word/document.xml', data: Buffer.from(xml, 'utf8') }]);
    const text = extractText(buf, 'policy.docx');
    expect(text).toContain('报销标准 & 上限');
    expect(text).toContain('一线城市 500 元');
  });

  it('文本型 PDF 提取括号里的文字', () => {
    const pdf = Buffer.from('BT (Hello onboarding policy) Tj ET', 'latin1');
    expect(extractText(pdf, 'policy.pdf')).toContain('Hello onboarding policy');
  });

  it('扫描件 PDF 提不到文字时给出明确原因', () => {
    const scanned = Buffer.from('%PDF-1.7\n\n\x00\x01\x02binary-stream\n%%EOF', 'latin1');
    expect(() => extractText(scanned, 'scan.pdf')).toThrow(/文字识别/);
  });

  it('旧版 .doc 与未知类型明确拒绝，不静默通过', () => {
    expect(() => extractText(Buffer.from('x'), 'a.doc')).toThrow(/另存为/);
    expect(() => extractText(Buffer.from('x'), 'a.exe')).toThrow(/不支持/);
  });
});
