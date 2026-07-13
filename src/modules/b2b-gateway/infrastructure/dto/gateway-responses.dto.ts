export class GatewayResponseDto<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  metadata?: Record<string, any>;

  constructor(partial: Partial<GatewayResponseDto<T>>) {
    Object.assign(this, partial);
  }
}
