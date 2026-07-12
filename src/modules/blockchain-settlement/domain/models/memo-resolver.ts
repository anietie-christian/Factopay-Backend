/**
 * Memo Resolver
 *
 * Resolves the correct Stellar transaction memo format based on the
 * destination anchor. Each African payout partner requires a specific
 * memo prefix to identify which payment the transaction belongs to.
 *
 * The memo is always required — never optional.
 */

export interface AnchorConfig {
  name: string;
  publicKey: string;
  memoPrefix: string;
  country: string;
}

// Known anchor configurations
// In production, these would be loaded from a database or config service.
const ANCHOR_REGISTRY: AnchorConfig[] = [
  {
    name: 'Flutterwave Stellar',
    publicKey: '', // Set via env or config
    memoPrefix: 'FW',
    country: 'NG',
  },
  {
    name: 'Kotani Pay',
    publicKey: '', // Set via env or config
    memoPrefix: 'KP',
    country: 'GH',
  },
  {
    name: 'VALR',
    publicKey: '', // Set via env or config
    memoPrefix: 'VALR',
    country: 'ZA',
  },
];

export class MemoResolver {
  private anchorMap: Map<string, AnchorConfig>;

  constructor(anchorConfigs?: AnchorConfig[]) {
    this.anchorMap = new Map();
    const configs = anchorConfigs || ANCHOR_REGISTRY;
    for (const config of configs) {
      if (config.publicKey) {
        this.anchorMap.set(config.publicKey, config);
      }
    }
  }

  /**
   * Resolves the memo for a given destination and transfer ID.
   * If the destination is a known anchor, applies the anchor-specific prefix.
   * Otherwise, uses the raw transfer ID as the memo.
   */
  resolve(destinationPublicKey: string, transferId: string): string {
    const anchor = this.anchorMap.get(destinationPublicKey);

    if (anchor) {
      return `${anchor.memoPrefix}-${transferId}`;
    }

    // Internal transfer or unknown destination: use raw transferId
    return transferId;
  }

  /**
   * Returns whether a destination is a known anchor.
   */
  isKnownAnchor(destinationPublicKey: string): boolean {
    return this.anchorMap.has(destinationPublicKey);
  }

  /**
   * Returns anchor info for a given public key, if known.
   */
  getAnchorInfo(destinationPublicKey: string): AnchorConfig | undefined {
    return this.anchorMap.get(destinationPublicKey);
  }
}
