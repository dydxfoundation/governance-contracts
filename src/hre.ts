import '@nomiclabs/hardhat-ethers/internal/type-extensions';
import { task } from 'hardhat/config';
import { ActionType, HardhatRuntimeEnvironment, TaskArguments } from 'hardhat/types';

import { NetworkName } from './types';

// Within src/, we use this method to access `hre` in order to avoid importing 'hardhat', since we
// cannot import 'hardhat' from file (such as tasks) that are imported from the hardhat config.
let hre: HardhatRuntimeEnvironment = null as unknown as HardhatRuntimeEnvironment;
let hreWasSet = false;

export const hardhatTask: typeof task = function hardhatTask<ArgsT extends TaskArguments>(
  name: string,
  descriptionOrAction?: string | ActionType<ArgsT>,
  action?: ActionType<ArgsT>,
) {
  if (action) {
    return task<ArgsT>(
      name,
      descriptionOrAction as string,
      (taskArgs, env, runSuper) => {
        setHre(env);
        return action(taskArgs, env, runSuper);
      },
    );
  }
  return task<ArgsT>(
    name,
    (taskArgs, env, runSuper) => {
      setHre(env);
      return (descriptionOrAction as ActionType<ArgsT>)(taskArgs, env, runSuper);
    },
  );
};

export function getNetworkName(): NetworkName {
  return getHre().network.name as NetworkName;
}

export function getHre(): HardhatRuntimeEnvironment {
  /* eslint-disable-next-line global-require */
  return hre || require('hardhat');
}

export function setHre(
  newHre: HardhatRuntimeEnvironment,
): void {
  if (hreWasSet) {
    return;
  }
  hre = newHre;
  hreWasSet = true;
}
