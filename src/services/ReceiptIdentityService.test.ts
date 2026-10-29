import axios from 'axios';
import sharp from 'sharp';
import { parseReceiptIdentity, readReceiptIdentity } from './ReceiptIdentityService';

jest.mock('axios');
const evidence = { merchant: 'Home Depot', merchantEvidence: 'https://www.homedepot.com/Pro_Xtra',
  merchantSource: 'seller_website', date: '2026-10-28', dateEvidence: '10/28/2026', dateSource: 'receipt' };

test('accepts a seller supported by the printed website and matching numeric date', () => {
  expect(parseReceiptIdentity(evidence)).toEqual({ merchant: 'Home Depot', date: '2026-10-28' });
});
test('rejects a different store from the evidence', () => {
  expect(parseReceiptIdentity({ ...evidence, merchant: "Lowe's" }).merchant).toBeNull();
});
test('rejects customer and delivery sources', () => {
  expect(parseReceiptIdentity({ ...evidence, merchantSource: 'customer', dateSource: 'delivery' })).toEqual({ merchant: null, date: null });
});
test('rejects invented year or day not present in the transcribed date', () => {
  expect(parseReceiptIdentity({ ...evidence, date: '2025-01-17' }).date).toBeNull();
  expect(parseReceiptIdentity({ ...evidence, date: '2026-10-29' }).date).toBeNull();
});
test('rejects impossible dates, missing evidence and missing identity', () => {
  expect(parseReceiptIdentity({ ...evidence, date: '2026-02-31', dateEvidence: '02/31/2026' }).date).toBeNull();
  expect(parseReceiptIdentity({ merchant: 'Home Depot', date: '2026-10-28' })).toEqual({ merchant: null, date: null });
  expect(parseReceiptIdentity(null)).toEqual({ merchant: null, date: null });
});
test('supports ISO and day-first purchase date evidence', () => {
  expect(parseReceiptIdentity({ ...evidence, dateEvidence: '2026-10-28' }).date).toBe('2026-10-28');
  expect(parseReceiptIdentity({ ...evidence, dateEvidence: '28/10/2026', dateSource: 'payment' }).date).toBe('2026-10-28');
});
test('accepts the literal purchase date when evidence includes its timestamp', () => {
  expect(parseReceiptIdentity({ ...evidence, dateEvidence: '10/28/2026, 6:15 PM EDT' }).date).toBe('2026-10-28');
  expect(parseReceiptIdentity({ ...evidence, dateEvidence: '10/28/2026 18:15:00' }).date).toBe('2026-10-28');
  expect(parseReceiptIdentity({ ...evidence, dateEvidence: '10/28/2020, 6:15 PM EDT' }).date).toBeNull();
  expect(parseReceiptIdentity({ ...evidence, dateEvidence: '10/28/2026 or 10/28/2020' }).date).toBeNull();
});
test('accepts a printed abbreviated POS year only when its digits match', () => {
  expect(parseReceiptIdentity({ ...evidence, dateEvidence: '10/28/26' }).date).toBe('2026-10-28');
  expect(parseReceiptIdentity({ ...evidence, dateEvidence: '10/28/25' }).date).toBeNull();
  expect(parseReceiptIdentity({ ...evidence, date: '1926-10-28', dateEvidence: '10/28/26' }).date).toBeNull();
});

describe('focused identity reading', () => {
  const post = axios.post as jest.Mock;
  const image = () => sharp({ create: { width: 576, height: 1024, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  beforeEach(() => post.mockReset());
  test('sends enlarged header crops and reads independent evidence', async () => {
    post.mockResolvedValue({ data: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(evidence) }] } });
    expect(await readReceiptIdentity([await image(), await image()], 'test-key')).toEqual({ merchant: 'Home Depot', date: '2026-10-28' });
    const [, body, options] = post.mock.calls[0];
    const images = body.messages[0].content.filter((part: any) => part.type === 'image');
    expect(images).toHaveLength(6);
    const dimensions = await sharp(Buffer.from(images[0].source.data, 'base64')).metadata();
    expect(dimensions.width).toBe(1152);
    expect(options.timeout).toBe(20000);
  });
  test('returns empty identity on timeout without exposing provider data', async () => {
    post.mockRejectedValue(new Error('secret payload'));
    expect(await readReceiptIdentity([await image()], 'test-key')).toEqual({ merchant: null, date: null });
  });
  test.each(['not JSON', '{}'])('handles invalid output safely: %s', async output => {
    post.mockResolvedValue({ data: { stop_reason: 'end_turn', content: [{ type: 'text', text: output }] } });
    expect(await readReceiptIdentity([await image()], 'test-key')).toEqual({ merchant: null, date: null });
  });
});
