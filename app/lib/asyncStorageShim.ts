const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(key);
    }
    return null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
  },
};

export default AsyncStorage;
