import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
} from "wagmi";

import { base, baseSepolia } from "wagmi/chains";
import { injected } from "@wagmi/core";

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
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
