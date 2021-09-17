import '@nomiclabs/hardhat-ethers/internal/type-extensions';
import hre from 'hardhat';

import { setHre } from '../src/hre';

setHre(hre);

export default hre;
