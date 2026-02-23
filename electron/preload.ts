import { contextBridge, ipcRenderer } from "electron";

type AccountType = "checking" | "savings" | "cash" | "credit";
type TransactionType = "income" | "expense";

type TxFilters = {
  startDate?: string;
  endDate?: string;
  type?: TransactionType | "all";
  category?: string;
  accountId?: number;
};

contextBridge.exposeInMainWorld("api", {
  register: (payload: { name: string; email: string; password: string }) =>
    ipcRenderer.invoke("auth:register", payload) as Promise<{
      ok: boolean;
      message?: string;
      user?: { id: number; name: string; email: string };
    }>,

  login: (payload: { email: string; password: string }) =>
    ipcRenderer.invoke("auth:login", payload) as Promise<{
      ok: boolean;
      message?: string;
      user?: { id: number; name: string; email: string };
    }>,

  listAccounts: (userId: number) =>
    ipcRenderer.invoke("accounts:list", userId) as Promise<
      {
        id: number;
        name: string;
        type: AccountType;
        initial_balance: number;
        current_balance: number;
        created_at: string;
      }[]
    >,

  createAccount: (userId: number, payload: { name: string; type: AccountType; initialBalance: number }) =>
    ipcRenderer.invoke("accounts:create", userId, payload) as Promise<{ ok: boolean; message?: string }>,

  listTransactions: (userId: number, filters?: TxFilters) =>
    ipcRenderer.invoke("transactions:list", userId, filters) as Promise<
      {
        id: number;
        account_id: number;
        account_name: string;
        type: TransactionType;
        category: string;
        description: string | null;
        amount: number;
        tx_date: string;
        created_at: string;
      }[]
    >,

  createTransaction: (
    userId: number,
    payload: {
      accountId: number;
      type: TransactionType;
      category: string;
      description?: string;
      amount: number;
      date: string;
    }
  ) => ipcRenderer.invoke("transactions:create", userId, payload) as Promise<{ ok: boolean; message?: string }>,

  updateTransaction: (
    userId: number,
    payload: {
      id: number;
      accountId: number;
      type: TransactionType;
      category: string;
      description?: string;
      amount: number;
      date: string;
    }
  ) => ipcRenderer.invoke("transactions:update", userId, payload) as Promise<{ ok: boolean; message?: string }>,

  deleteTransaction: (userId: number, txId: number) =>
    ipcRenderer.invoke("transactions:delete", userId, txId) as Promise<{ ok: boolean; message?: string }>,

  getSummary: (userId: number) =>
    ipcRenderer.invoke("finance:summary", userId) as Promise<{
      income: number;
      expense: number;
      balance: number;
      transactions: number;
    }>,

  setBudget: (userId: number, payload: { month: string; category: string; limitAmount: number }) =>
    ipcRenderer.invoke("budgets:set", userId, payload) as Promise<{ ok: boolean; message?: string }>,

  listBudgets: (userId: number, month: string) =>
    ipcRenderer.invoke("budgets:list", userId, month) as Promise<
      {
        category: string;
        limit: number;
        spent: number;
        remaining: number;
        percent: number;
        status: "ok" | "warning" | "exceeded";
      }[]
    >,

  onMainProcessMessage: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("main-process-message", listener);
    return () => ipcRenderer.removeListener("main-process-message", listener);
  },
});