/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string;
    VITE_PUBLIC: string;
  }
}

type AccountType = "checking" | "savings" | "cash" | "credit";
type TransactionType = "income" | "expense";
type TxFilters = {
  startDate?: string;
  endDate?: string;
  type?: TransactionType | "all";
  category?: string;
  accountId?: number;
};

interface Window {
  api: {
    register: (payload: { name: string; email: string; password: string }) => Promise<{
      ok: boolean;
      message?: string;
      user?: { id: number; name: string; email: string };
    }>;
    login: (payload: { email: string; password: string }) => Promise<{
      ok: boolean;
      message?: string;
      user?: { id: number; name: string; email: string };
    }>;
    listAccounts: (userId: number) => Promise<
      {
        id: number;
        name: string;
        type: AccountType;
        initial_balance: number;
        current_balance: number;
        created_at: string;
      }[]
    >;
    createAccount: (
      userId: number,
      payload: { name: string; type: AccountType; initialBalance: number }
    ) => Promise<{ ok: boolean; message?: string }>;
    listTransactions: (userId: number, filters?: TxFilters) => Promise<
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
    >;
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
    ) => Promise<{ ok: boolean; message?: string }>;
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
    ) => Promise<{ ok: boolean; message?: string }>;
    deleteTransaction: (userId: number, txId: number) => Promise<{ ok: boolean; message?: string }>;
    getSummary: (userId: number) => Promise<{
      income: number;
      expense: number;
      balance: number;
      transactions: number;
    }>;
    setBudget: (
      userId: number,
      payload: { month: string; category: string; limitAmount: number }
    ) => Promise<{ ok: boolean; message?: string }>;
    listBudgets: (userId: number, month: string) => Promise<
      {
        category: string;
        limit: number;
        spent: number;
        remaining: number;
        percent: number;
        status: "ok" | "warning" | "exceeded";
      }[]
    >;
    onMainProcessMessage: (callback: (message: string) => void) => () => void;
  };
}