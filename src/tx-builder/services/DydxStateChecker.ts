import { DydxGovernor, DydxGovernor__factory } from '../../../types';
import { Configuration } from '../types';

export class DydxStateChecker {
  readonly config: Configuration;

  constructor(config: Configuration) {
    this.config = config;
  }

  public async getGovernanceVoters(
    governorContractAddress: string,
    maxBlock: number,
  ): Promise<Set<string>> {
    const { provider }: Configuration = this.config;

    const governor: DydxGovernor = await DydxGovernor__factory.connect(
      governorContractAddress,
      provider,
    );

    const filter = governor.filters.VoteEmitted(null, null, null, null);
    const events = await governor.queryFilter(filter);

    // filter down events to those lte maxBlock
    const filteredEvents = events.filter((event) => event.blockNumber <= maxBlock);
    return new Set(filteredEvents.map((event) => event.args![1] as string));
  }
}
