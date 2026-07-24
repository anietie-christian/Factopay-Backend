// ---------------------------------------------------------------------------------------------------------------#*eddiere
export class KycStatusChangedEvent {
    static readonly eventName = 'kyc.status.changed';

    constructor(
        public readonly userId: string,
        public readonly oldStatus: string,
        public readonly newStatus: string,
        public readonly oldTier: string,
        public readonly newTier: string,
    ) { }
}