import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
} from "wagmi";

import { base } from "wagmi/chains";
import { injected } from "@wagmi/core";

export const config = createConfig({
  chains: [base],

  connectors: [
    injected(),
  ],

  storage: createStorage({
    storage: cookieStorage,
  }),

  ssr: true,

  transports: {
    [base.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}