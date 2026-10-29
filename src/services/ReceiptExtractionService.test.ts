import axios from 'axios';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { extractReceipt, normalizeReceiptTotal, parseReceipt, resolveReceiptTotal } from './ReceiptExtractionService';
import { readReceiptIdentity } from './ReceiptIdentityService';

describe('receipt total normalization', () => {
  test.each([
    ['2573.47', '2573.47'], ['$2,573.47', '2573.47'], ['USD 2,573.47', '2573.47'],
    ['2,573.47 USD', '2573.47'], ['US$ 2,573.47', '2573.47'], [2573.47, '2573.47'],
    ['44.03', '44.03'], ['2.573,47', '2573.47'], ['2573,47', '2573.47'],
    ['2,573', '2573'], ['  $44.03  ', '44.03'],
  ])('normalizes %p without changing the value', (input, expected) => {
    expect(normalizeReceiptTotal(input)).toBe(expected);
    expect(parseReceipt({ total: input }).total).toBe(expected);
  });
  test.each([null, undefined, '', 'unknown', '$0.00', '-12.00', '(12.00)', '2,57,3.47',
    '2.573', '2573.471', '2573.47 or 2958.96', '2958.96 - 385.49', 'Total: $2573.47', Infinity, NaN,
    '99999999999.99', '<b>2573.47</b>'])('rejects ambiguous or invalid value %p', input => {
    expect(normalizeReceiptTotal(input)).toBeNull();
  });
});

jest.mock('axios');
jest.mock('./ReceiptIdentityService', () => ({ readReceiptIdentity: jest.fn() }));

describe('visible receipt item calculation', () => {
  const items = ['1239.00', '389.00', '12.98', '657.51', '39.98', '235.00', '$0.00'].map(lineTotal => ({ lineTotal }));
  test('calculates the supplied page including free delivery', () => {
    expect(resolveReceiptTotal({ total: null, items, adjustments: [] })).toBe('2573.47');
  });
  test('explicit total wins over item sums and adjustments', () => {
    expect(resolveReceiptTotal({ total: '2500.00', items, adjustments: ['-10.00'] })).toBe('2500.00');
  });
  test('uses row total once, otherwise quantity times unit price', () => {
    expect(resolveReceiptTotal({ items: [{ quantity: '3', unitPrice: '10', lineTotal: '30' }, { quantity: '2', unitPrice: '5.25' }] })).toBe('40.50');
  });
  test('applies only supplied separate adjustments', () => {
    expect(resolveReceiptTotal({ items: [{ lineTotal: '100' }], adjustments: ['8.25', '-10.00'] })).toBe('98.25');
  });
  test('does not silently skip unreadable rows or invent missing quantities', () => {
    expect(resolveReceiptTotal({ items: [{ lineTotal: '100' }, { lineTotal: null }] })).toBeNull();
    expect(resolveReceiptTotal({ items: [{ unitPrice: '100' }] })).toBeNull();
    expect(resolveReceiptTotal({ items: [], total: null })).toBeNull();
  });
});

describe('receipt provider boundary', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const post = axios.post as jest.Mock;
  beforeEach(() => {
    post.mockReset(); process.env.ANTHROPIC_API_KEY = 'test-key';
    (readReceiptIdentity as jest.Mock).mockReset().mockResolvedValue({ merchant: 'Store', date: '2026-10-27' });
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });
  const image = () => sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer();

  it('does not contact the provider without a configured key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(extractReceipt(Buffer.from('image'))).rejects.toMatchObject({ code: 'RECEIPT_AI_UNAVAILABLE', status: 503 });
    expect(post).not.toHaveBeenCalled();
  });
  it('rejects invalid images before sending', async () => {
    await expect(extractReceipt(Buffer.from('not an image'))).rejects.toMatchObject({ code: 'INVALID_RECEIPT_IMAGE', status: 422 });
    expect(post).not.toHaveBeenCalled();
  });
  it('returns normalized fields from a forced tool response', async () => {
    post.mockResolvedValue({ data: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'receipt_data', input: {
      merchant: 'Store', date: '2026-10-27', currency: 'usd', total: '12.34', description: '<b>Materials</b>',
    } }] } });
    await expect(extractReceipt(await image())).resolves.toEqual({ merchant: 'Store', date: '2026-10-27', currency: 'USD', total: '12.34', description: 'Materials' });
    const [, body, options] = post.mock.calls[0];
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'receipt_data' });
    expect(body.messages[0].content[0].source.media_type).toBe('image/jpeg');
    expect(options.timeout).toBe(45000);
  });
  it('rejects truncated output', async () => {
    post.mockResolvedValue({ data: { stop_reason: 'max_tokens', content: [] } });
    await expect(extractReceipt(await image())).rejects.toMatchObject({ code: 'INVALID_EXTRACTION', status: 422 });
  });
  it('replaces guessed identity with the independently verified seller and purchase date', async () => {
    post.mockResolvedValue({ data: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'receipt_data', input: {
      merchant: 'Wrong store', date: '2025-01-17', total: '2573.47', currency: 'USD',
    } }] } });
    (readReceiptIdentity as jest.Mock).mockResolvedValue({ merchant: 'Home Depot', date: '2026-10-28' });
    expect(await extractReceipt(await image())).toMatchObject({ merchant: 'Home Depot', date: '2026-10-28', total: '2573.47' });
  });
  it('does not restore guessed identity if the verification cannot read it', async () => {
    post.mockResolvedValue({ data: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'receipt_data', input: {
      merchant: 'Wrong store', date: '2025-01-17', total: '2573.47',
    } }] } });
    (readReceiptIdentity as jest.Mock).mockResolvedValue({ merchant: null, date: null });
    expect(await extractReceipt(await image())).toMatchObject({ merchant: null, date: null, total: '2573.47' });
  });
  it('sends all pages together and preserves them in a single attachment', async () => {
    post.mockResolvedValue({ data: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'receipt_data', input: {
      merchant: 'Home Depot', total: '2573.47', currency: 'USD',
    } }] } });
    const receipt = await extractReceipt([await image(), await image()]);
    expect(receipt.total).toBe('2573.47');
    expect(post).toHaveBeenCalledTimes(1);
    const content = post.mock.calls[0][1].messages[0].content;
    expect(content.filter((part: any) => part.type === 'image')).toHaveLength(6);
    const pdf = await PDFDocument.load(Buffer.from(receipt.attachmentPdf!, 'base64'));
    expect(pdf.getPageCount()).toBe(2);
  });
  it('preserves missing total instead of estimating or substituting a balance', async () => {
    post.mockResolvedValue({ data: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'receipt_data', input: {
      total: null, currency: 'USD', subtotal: '2958.96', balanceDue: '0.00',
    } }] } });
    expect((await extractReceipt(await image())).total).toBeNull();
  });
  it('preserves a recognized total even if the provider includes currency and grouping', async () => {
    post.mockResolvedValue({ data: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'receipt_data', input: {
      total: '$2,573.47', currency: 'USD',
    } }] } });
    expect((await extractReceipt(await image())).total).toBe('2573.47');
  });
  it('rejects empty or excessive page counts without contacting AI', async () => {
    await expect(extractReceipt([])).rejects.toMatchObject({ code: 'INVALID_RECEIPT_IMAGE' });
    await expect(extractReceipt(Array(6).fill(Buffer.from('image')))).rejects.toMatchObject({ code: 'INVALID_RECEIPT_IMAGE' });
    expect(post).not.toHaveBeenCalled();
  });
  it('does not expose provider credentials or payload in errors', async () => {
    post.mockRejectedValue(new Error('private image and test-key'));
    await expect(extractReceipt(await image())).rejects.toMatchObject({ message: 'RECEIPT_AI_FAILED', status: 502 });
  });
});
