import { OutboundWebhookService } from '../outbound-webhook.service';
import axios from 'axios';
import * as crypto from 'crypto';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OutboundWebhookService', () => {
  let service: OutboundWebhookService;

  beforeEach(() => {
    service = new OutboundWebhookService();
    jest.clearAllMocks();
  });

  it('should sign the payload correctly and send POST request', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200 });

    const payload = {
      eventId: 'evt_123',
      eventType: 'transfer.completed',
      data: { transferId: 'tr_123' },
      timestamp: new Date().toISOString(),
    };
    const secret = 'whsec_test_secret';

    const result = await service.sendWebhook('https://example.com/webhook', secret, payload);

    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    
    const [url, data, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://example.com/webhook');
    expect(data).toBe(JSON.stringify(payload));
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
      
    expect(config?.headers?.['x-factopay-signature']).toBe(expectedSignature);
  });
});
