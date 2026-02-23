import { ipcMain } from "electron";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "../db/database";

type AuthResult = {
  ok: boolean;
  message?: string;
  user?: {
    id: number;
    name: string;
    email: string;
  };
};

type AccountType = "checking" | "savings" | "cash" | "credit";
type TxType = "income" | "expense";

type ListFilter = {
  startDate?: string;
  endDate?: string;
  type?: TxType | "all";
  category?: string;
  accountId?: number;
};

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const passwordBuffer = scryptSync(password, salt, 64);
  const hashBuffer = Buffer.from(hash, "hex");

  if (hashBuffer.length !== passwordBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, passwordBuffer);
}

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidTxType(type: string): type is TxType {
  return type === "income" || type === "expense";
}

function signedAmount(type: TxType, amount: number): number {
  return type === "income" ? amount : -amount;
}

export function registerFinanceIpc() {
  ipcMain.handle("auth:register", (_event, payload: { name: string; email: string; password: string }): AuthResult => {
    const name = payload.name?.trim();
    const email = sanitizeEmail(payload.email ?? "");
    const password = payload.password ?? "";

    if (!name || !email || !password) {
      return { ok: false, message: "Preencha nome, e-mail e senha." };
    }

    if (password.length < 6) {
      return { ok: false, message: "A senha deve ter pelo menos 6 caracteres." };
    }

    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
    if (existing) {
      return { ok: false, message: "E-mail ja cadastrado." };
    }

    const passwordHash = hashPassword(password);
    const insertUser = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)");

    const tx = db.transaction(() => {
      const result = insertUser.run(name, email, passwordHash);
      const userId = Number(result.lastInsertRowid);
      db.prepare(
        "INSERT INTO accounts (user_id, name, type, initial_balance, current_balance) VALUES (?, ?, 'checking', 0, 0)"
      ).run(userId, "Conta Principal");

      return userId;
    });

    const userId = tx();

    return {
      ok: true,
      user: { id: userId, name, email },
    };
  });

  ipcMain.handle("auth:login", (_event, payload: { email: string; password: string }): AuthResult => {
    const email = sanitizeEmail(payload.email ?? "");
    const password = payload.password ?? "";

    const db = getDb();
    const row = db
      .prepare("SELECT id, name, email, password_hash FROM users WHERE email = ?")
      .get(email) as { id: number; name: string; email: string; password_hash: string } | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      return { ok: false, message: "Credenciais invalidas." };
    }

    return {
      ok: true,
      user: { id: row.id, name: row.name, email: row.email },
    };
  });

  ipcMain.handle(
    "accounts:list",
    (_event, userId: number):
      | { id: number; name: string; type: AccountType; initial_balance: number; current_balance: number; created_at: string }[]
      | [] => {
      return getDb()
        .prepare(
          "SELECT id, name, type, initial_balance, current_balance, created_at FROM accounts WHERE user_id = ? ORDER BY id DESC"
        )
        .all(userId) as {
        id: number;
        name: string;
        type: AccountType;
        initial_balance: number;
        current_balance: number;
        created_at: string;
      }[];
    }
  );

  ipcMain.handle(
    "accounts:create",
    (_event, userId: number, payload: { name: string; type: AccountType; initialBalance: number }):
      | { ok: true }
      | { ok: false; message: string } => {
      const name = payload.name?.trim();
      const type = payload.type;
      const initialBalance = Number(payload.initialBalance ?? 0);

      if (!name) {
        return { ok: false, message: "Nome da conta e obrigatorio." };
      }

      if (!["checking", "savings", "cash", "credit"].includes(type)) {
        return { ok: false, message: "Tipo de conta invalido." };
      }

      if (Number.isNaN(initialBalance)) {
        return { ok: false, message: "Saldo inicial invalido." };
      }

      getDb()
        .prepare("INSERT INTO accounts (user_id, name, type, initial_balance, current_balance) VALUES (?, ?, ?, ?, ?)")
        .run(userId, name, type, initialBalance, initialBalance);

      return { ok: true };
    }
  );

  ipcMain.handle(
    "transactions:list",
    (_event, userId: number, filters?: ListFilter):
      | {
          id: number;
          account_id: number;
          account_name: string;
          type: TxType;
          category: string;
          description: string | null;
          amount: number;
          tx_date: string;
          created_at: string;
        }[]
      | [] => {
      const clauses = ["t.user_id = ?"];
      const params: Array<number | string> = [userId];

      if (filters?.startDate) {
        clauses.push("t.tx_date >= ?");
        params.push(filters.startDate);
      }

      if (filters?.endDate) {
        clauses.push("t.tx_date <= ?");
        params.push(filters.endDate);
      }

      if (filters?.type && filters.type !== "all") {
        clauses.push("t.type = ?");
        params.push(filters.type);
      }

      if (filters?.category) {
        clauses.push("t.category = ?");
        params.push(filters.category);
      }

      if (filters?.accountId) {
        clauses.push("t.account_id = ?");
        params.push(Number(filters.accountId));
      }

      const sql = `SELECT t.id, t.account_id, a.name AS account_name, t.type, t.category, t.description, t.amount, t.tx_date, t.created_at
                   FROM transactions t
                   INNER JOIN accounts a ON a.id = t.account_id
                   WHERE ${clauses.join(" AND ")}
                   ORDER BY t.tx_date DESC, t.id DESC`;

      return getDb().prepare(sql).all(...params) as {
        id: number;
        account_id: number;
        account_name: string;
        type: TxType;
        category: string;
        description: string | null;
        amount: number;
        tx_date: string;
        created_at: string;
      }[];
    }
  );

  ipcMain.handle(
    "transactions:create",
    (
      _event,
      userId: number,
      payload: {
        accountId: number;
        type: TxType;
        category: string;
        description?: string;
        amount: number;
        date: string;
      }
    ): { ok: true } | { ok: false; message: string } => {
      const accountId = Number(payload.accountId);
      const type = payload.type;
      const category = payload.category?.trim();
      const description = payload.description?.trim() ?? "";
      const amount = Number(payload.amount);
      const date = payload.date?.trim();

      if (!accountId || !category || !date) {
        return { ok: false, message: "Conta, categoria e data sao obrigatorias." };
      }

      if (!isValidTxType(type)) {
        return { ok: false, message: "Tipo de transacao invalido." };
      }

      if (Number.isNaN(amount) || amount <= 0) {
        return { ok: false, message: "Valor deve ser maior que zero." };
      }

      const db = getDb();
      const account = db
        .prepare("SELECT id, user_id FROM accounts WHERE id = ?")
        .get(accountId) as { id: number; user_id: number } | undefined;

      if (!account || account.user_id !== userId) {
        return { ok: false, message: "Conta nao encontrada." };
      }

      const delta = signedAmount(type, amount);

      const runTx = db.transaction(() => {
        db.prepare(
          "INSERT INTO transactions (user_id, account_id, type, category, description, amount, tx_date) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(userId, accountId, type, category, description || null, amount, date);

        db.prepare("UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?").run(delta, accountId);
      });

      runTx();
      return { ok: true };
    }
  );

  ipcMain.handle(
    "transactions:update",
    (
      _event,
      userId: number,
      payload: {
        id: number;
        accountId: number;
        type: TxType;
        category: string;
        description?: string;
        amount: number;
        date: string;
      }
    ): { ok: true } | { ok: false; message: string } => {
      const txId = Number(payload.id);
      const newAccountId = Number(payload.accountId);
      const newType = payload.type;
      const newCategory = payload.category?.trim();
      const newDescription = payload.description?.trim() ?? "";
      const newAmount = Number(payload.amount);
      const newDate = payload.date?.trim();

      if (!txId || !newAccountId || !newCategory || !newDate) {
        return { ok: false, message: "Dados obrigatorios nao informados." };
      }

      if (!isValidTxType(newType)) {
        return { ok: false, message: "Tipo de transacao invalido." };
      }

      if (Number.isNaN(newAmount) || newAmount <= 0) {
        return { ok: false, message: "Valor deve ser maior que zero." };
      }

      const db = getDb();

      const current = db
        .prepare("SELECT id, user_id, account_id, type, amount FROM transactions WHERE id = ?")
        .get(txId) as { id: number; user_id: number; account_id: number; type: TxType; amount: number } | undefined;

      if (!current || current.user_id !== userId) {
        return { ok: false, message: "Transacao nao encontrada." };
      }

      const newAccount = db
        .prepare("SELECT id, user_id FROM accounts WHERE id = ?")
        .get(newAccountId) as { id: number; user_id: number } | undefined;

      if (!newAccount || newAccount.user_id !== userId) {
        return { ok: false, message: "Conta nao encontrada." };
      }

      const oldDelta = signedAmount(current.type, Number(current.amount));
      const newDelta = signedAmount(newType, newAmount);

      const runTx = db.transaction(() => {
        db.prepare("UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?").run(oldDelta, current.account_id);

        db.prepare("UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?").run(newDelta, newAccountId);

        db.prepare(
          "UPDATE transactions SET account_id = ?, type = ?, category = ?, description = ?, amount = ?, tx_date = ? WHERE id = ?"
        ).run(newAccountId, newType, newCategory, newDescription || null, newAmount, newDate, txId);
      });

      runTx();
      return { ok: true };
    }
  );

  ipcMain.handle(
    "transactions:delete",
    (_event, userId: number, txId: number): { ok: true } | { ok: false; message: string } => {
      const db = getDb();
      const current = db
        .prepare("SELECT id, user_id, account_id, type, amount FROM transactions WHERE id = ?")
        .get(txId) as { id: number; user_id: number; account_id: number; type: TxType; amount: number } | undefined;

      if (!current || current.user_id !== userId) {
        return { ok: false, message: "Transacao nao encontrada." };
      }

      const oldDelta = signedAmount(current.type, Number(current.amount));

      const runTx = db.transaction(() => {
        db.prepare("DELETE FROM transactions WHERE id = ?").run(txId);
        db.prepare("UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?").run(oldDelta, current.account_id);
      });

      runTx();
      return { ok: true };
    }
  );

  ipcMain.handle(
    "finance:summary",
    (_event, userId: number): { income: number; expense: number; balance: number; transactions: number } => {
      const db = getDb();

      const txSummary = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
             COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
             COUNT(*) AS transactions
           FROM transactions
           WHERE user_id = ?`
        )
        .get(userId) as { income: number; expense: number; transactions: number };

      const accountBalance = db
        .prepare("SELECT COALESCE(SUM(current_balance), 0) AS balance FROM accounts WHERE user_id = ?")
        .get(userId) as { balance: number };

      return {
        income: Number(txSummary.income ?? 0),
        expense: Number(txSummary.expense ?? 0),
        balance: Number(accountBalance.balance ?? 0),
        transactions: Number(txSummary.transactions ?? 0),
      };
    }
  );

  ipcMain.handle(
    "budgets:set",
    (_event, userId: number, payload: { month: string; category: string; limitAmount: number }):
      | { ok: true }
      | { ok: false; message: string } => {
      const month = payload.month?.trim();
      const category = payload.category?.trim();
      const limitAmount = Number(payload.limitAmount);

      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return { ok: false, message: "Mes invalido. Use YYYY-MM." };
      }

      if (!category) {
        return { ok: false, message: "Categoria e obrigatoria." };
      }

      if (Number.isNaN(limitAmount) || limitAmount <= 0) {
        return { ok: false, message: "Limite deve ser maior que zero." };
      }

      getDb()
        .prepare(
          `INSERT INTO monthly_budgets (user_id, month, category, limit_amount)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, month, category)
           DO UPDATE SET limit_amount = excluded.limit_amount, updated_at = datetime('now')`
        )
        .run(userId, month, category, limitAmount);

      return { ok: true };
    }
  );

  ipcMain.handle(
    "budgets:list",
    (
      _event,
      userId: number,
      month: string
    ): {
      category: string;
      limit: number;
      spent: number;
      remaining: number;
      percent: number;
      status: "ok" | "warning" | "exceeded";
    }[] => {
      if (!/^\d{4}-\d{2}$/.test(month ?? "")) {
        return [];
      }

      const db = getDb();
      let rows: { category: string; budget_limit: number; spent: number }[] = [];
      try {
        rows = db
          .prepare(
            `SELECT
               b.category AS category,
               b."limit_amount" AS budget_limit,
               COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS spent
             FROM monthly_budgets b
             LEFT JOIN transactions t
               ON t.user_id = b.user_id
               AND t.category = b.category
               AND substr(t.tx_date, 1, 7) = b.month
             WHERE b.user_id = ? AND b.month = ?
             GROUP BY b.category, b."limit_amount"
             ORDER BY b.category ASC`
          )
          .all(userId, month) as { category: string; budget_limit: number; spent: number }[];
      } catch (error) {
        // Fallback for legacy SQLite parsing edge-cases on some runtimes.
        rows = db
          .prepare(
            `SELECT
               b.category AS category,
               b.limit_amount AS budget_limit,
               COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS spent
             FROM monthly_budgets b
             LEFT JOIN transactions t
               ON t.user_id = b.user_id
               AND t.category = b.category
               AND substr(t.tx_date, 1, 7) = b.month
             WHERE b.user_id = ? AND b.month = ?
             GROUP BY b.category, b.limit_amount
             ORDER BY b.category ASC`
          )
          .all(userId, month) as { category: string; budget_limit: number; spent: number }[];
        console.error("budgets:list fallback SQL path used:", error);
      }

      return rows.map((row) => {
        const limit = Number(row.budget_limit);
        const spent = Number(row.spent);
        const remaining = limit - spent;
        const percent = limit > 0 ? (spent / limit) * 100 : 0;
        let status: "ok" | "warning" | "exceeded" = "ok";

        if (percent >= 100) {
          status = "exceeded";
        } else if (percent >= 80) {
          status = "warning";
        }

        return {
          category: row.category,
          limit,
          spent,
          remaining,
          percent,
          status,
        };
      });
    }
  );
}
