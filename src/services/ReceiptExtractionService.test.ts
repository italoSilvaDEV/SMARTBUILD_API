import axios from 'axios';
import sharp from 'sharp';
import { extractReceipt } from './ReceiptExtractionService';

jest.mock('axios');

describe('receipt provider boundary', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const post = axios.post as jest.Mock;
  beforeEach(() => { post.mockReset(); process.env.ANTHROPIC_API_KEY = 'test-key'; });
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
  it('does not expose provider credentials or payload in errors', async () => {
    post.mockRejectedValue(new Error('private image and test-key'));
    await expect(extractReceipt(await image())).rejects.toMatchObject({ message: 'RECEIPT_AI_FAILED', status: 502 });
  });
});
