// lib/workspace/policy-parser.ts
//
// 制度文件解析（零外部依赖）：
//   .txt/.md/.csv → 直接按 UTF-8 读取
//   .docx         → Word 本质是 zip，用 node:zlib 解出 word/document.xml 再提取 <w:t> 文字
//   .pdf          → 尝试从内容流里提取文本；提不到可读文字就明确失败（扫描件需先 OCR）
// 解析在后台任务里跑，上传接口只负责落库为「排队中」并立即返回，不卡页面。

import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { extname } from 'node:path';
import { prisma } from '@/lib/db';

/** 从 zip 中取出一个文件条目（只认 store/deflate，够 docx 用） */
function unzipEntry(buf: Buffer, wanted: string): Buffer | null {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && ptr + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const entryName = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    if (entryName === wanted) {
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const data = buf.subarray(start, start + compressedSize);
      return method === 8 ? inflateRawSync(data) : Buffer.from(data);
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

export function extractText(buf: Buffer, fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (['.txt', '.md', '.csv', '.text'].includes(ext)) {
    return buf.toString('utf8').replace(/\r\n/g, '\n').trim();
  }
  if (ext === '.docx') {
    const xml = unzipEntry(buf, 'word/document.xml')?.toString('utf8');
    if (!xml) throw new Error('Word 文件结构无法读取，请确认是 .docx 格式');
    return decodeXmlEntities(
      xml
        .replace(/<w:tab[^>]*\/>/g, '\t')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n'),
    ).trim();
  }
  if (ext === '.pdf') {
    const raw = buf.toString('latin1');
    const escapes: Record<string, string> = { n: '\n', r: '', t: '\t', b: '', f: '' };
    const chunks = [...raw.matchAll(/\(((?:\\.|[^\\()])*)\)/g)].map((m) =>
      m[1]
        .replace(/\\([nrtbf()\\])/g, (_, c: string) => escapes[c] ?? c)
        .replace(/\\[0-7]{1,3}/g, ''),
    );
    const text = chunks
      .join(' ')
      .replace(/[^\u0020-\u007e\u4e00-\u9fa5，。、；：（）“”【】\n\t]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!text) throw new Error('未能从 PDF 里提取到文字，扫描件需要先做文字识别（OCR）');
    return text;
  }
  if (ext === '.doc') {
    throw new Error('旧版 .doc 暂不支持，请先另存为 .docx 或纯文本');
  }
  throw new Error('不支持的文件类型，请上传 PDF、Word（.docx）或文本文件');
}

let scheduled = false;

/** 把排队中的文档推到后台解析；进程内去重，页面轮询也会兜底再触发一次 */
export function schedulePolicyProcessing(): void {
  if (scheduled) return;
  scheduled = true;
  const timer = setTimeout(() => {
    scheduled = false;
    void processQueuedPolicies();
  }, 400);
  timer.unref?.();
}

export async function processQueuedPolicies(): Promise<void> {
  const queued = await prisma.policyDocument.findMany({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  if (queued.length === 0) return;

  // 先批量认领（CAS 防重复触发），再并行解析：一次上传多份时不必排队等前一份
  const claimed: (typeof queued)[number][] = [];
  for (const doc of queued) {
    const result = await prisma.policyDocument.updateMany({
      where: { id: doc.id, status: 'queued' },
      data: { status: 'parsing' },
    });
    if (result.count > 0) claimed.push(doc);
  }

  await Promise.all(
    claimed.map(async (doc) => {
      try {
        // 短暂留白让「排队中 → 解析中 → 待发布」在自动刷新的页面上可被看见
        await new Promise((resolve) => setTimeout(resolve, 900));
        const buf = await readFile(doc.filePath);
        const content = extractText(buf, doc.fileName);
        if (content.length < 10) {
          throw new Error('解析出来的正文过短，请确认文件里有文字内容');
        }
        await prisma.policyDocument.update({
          where: { id: doc.id },
          data: { status: 'pending', content, failureReason: null },
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : '解析失败，请重试';
        await prisma.policyDocument.update({
          where: { id: doc.id },
          data: { status: 'failed', failureReason: reason, content: '' },
        });
      }
    }),
  );
}
