import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
} from "wagmi";

import { base, baseSepolia } from "wagmi/chains";
import { injected } from "@wagmi/core";
import { Attribution } from "ox/erc8021";

const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: ["bc_wsh2e7z6"],
});

export const config = createConfig({
  chains: [base, baseSepolia],

  connectors: [
    injected(),
  ],

  storage: createStorage({
    storage: cookieStorage,
  }),

  ssr: true,

  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },

  dataSuffix: DATA_SUFFIX,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}