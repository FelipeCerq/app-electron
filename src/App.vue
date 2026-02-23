<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

type AccountType = "checking" | "savings" | "cash" | "credit";
type TransactionType = "income" | "expense";
type TxFilterType = TransactionType | "all";
type ThemeMode = "dark" | "light";

type User = { id: number; name: string; email: string };
type Account = {
  id: number;
  name: string;
  type: AccountType;
  initial_balance: number;
  current_balance: number;
  created_at: string;
};
type Transaction = {
  id: number;
  account_id: number;
  account_name: string;
  type: TransactionType;
  category: string;
  description: string | null;
  amount: number;
  tx_date: string;
  created_at: string;
};
type Summary = {
  income: number;
  expense: number;
  balance: number;
  transactions: number;
};
type Budget = {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  percent: number;
  status: "ok" | "warning" | "exceeded";
};
type TrendPoint = {
  month: string;
  income: number;
  expense: number;
  net: number;
};

const INCOME_CATEGORIES = ["Salario", "Freelance", "Investimentos", "Reembolso", "Vendas", "Outros"];
const EXPENSE_CATEGORIES = [
  "Moradia",
  "Alimentacao",
  "Transporte",
  "Saude",
  "Educacao",
  "Lazer",
  "Impostos",
  "Assinaturas",
  "Outros",
];

const authMode = ref<"login" | "register">("login");
const authLoading = ref(false);
const authMessage = ref("");

const registerName = ref("");
const registerEmail = ref("");
const registerPassword = ref("");

const loginEmail = ref("");
const loginPassword = ref("");

const user = ref<User | null>(null);

const accounts = ref<Account[]>([]);
const transactions = ref<Transaction[]>([]);
const allTransactions = ref<Transaction[]>([]);
const summary = ref<Summary>({ income: 0, expense: 0, balance: 0, transactions: 0 });
const budgets = ref<Budget[]>([]);

const dashboardMessage = ref("");

const accountName = ref("");
const accountType = ref<AccountType>("checking");
const accountInitialBalance = ref<number>(0);

const editingTransactionId = ref<number | null>(null);
const txAccountId = ref<number>(0);
const txType = ref<TransactionType>("expense");
const txCategory = ref(EXPENSE_CATEGORIES[0]);
const txDescription = ref("");
const txAmount = ref<number>(0);
const txDate = ref(new Date().toISOString().slice(0, 10));

const firstDayOfMonth = `${new Date().toISOString().slice(0, 7)}-01`;
const today = new Date().toISOString().slice(0, 10);

const filterStartDate = ref(firstDayOfMonth);
const filterEndDate = ref(today);
const filterType = ref<TxFilterType>("all");
const filterCategory = ref("");
const filterAccountId = ref<number>(0);

const budgetMonth = ref(new Date().toISOString().slice(0, 7));
const budgetCategory = ref(EXPENSE_CATEGORIES[0]);
const budgetLimit = ref<number>(0);

const themeMode = ref<ThemeMode>("dark");

const isAuthenticated = computed(() => Boolean(user.value));
const isEditingTransaction = computed(() => editingTransactionId.value !== null);

const transactionCategories = computed(() => (txType.value === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES));
const filterCategoryOptions = computed(() =>
  filterType.value === "income"
    ? INCOME_CATEGORIES
    : filterType.value === "expense"
      ? EXPENSE_CATEGORIES
      : Array.from(new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]))
);

const budgetAlerts = computed(() => budgets.value.filter((budget) => budget.status !== "ok"));

const flowTotal = computed(() => Math.max(summary.value.income + summary.value.expense, 1));
const incomeStrength = computed(() => Math.min((summary.value.income / flowTotal.value) * 100, 100));
const expenseStrength = computed(() => Math.min((summary.value.expense / flowTotal.value) * 100, 100));
const balanceStrength = computed(() => {
  const denominator = Math.max(Math.abs(summary.value.income - summary.value.expense), 1);
  const ratio = Math.min(Math.abs(summary.value.balance) / denominator, 1);
  return ratio * 100;
});

const trendPoints = computed<TrendPoint[]>(() => {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  const map = new Map<string, TrendPoint>(
    months.map((month) => [month, { month, income: 0, expense: 0, net: 0 }])
  );

  allTransactions.value.forEach((tx) => {
    const month = tx.tx_date.slice(0, 7);
    const row = map.get(month);
    if (!row) {
      return;
    }
    if (tx.type === "income") {
      row.income += tx.amount;
      row.net += tx.amount;
    } else {
      row.expense += tx.amount;
      row.net -= tx.amount;
    }
  });

  return months.map((month) => map.get(month) as TrendPoint);
});

const trendMaxAbs = computed(() => {
  const peak = Math.max(...trendPoints.value.map((p) => Math.abs(p.net)), 1);
  return peak;
});

const trendPath = computed(() => {
  const points = trendPoints.value;
  if (points.length === 0) {
    return "";
  }

  const width = 100;
  const baseY = 50;
  const amplitude = 40;
  const step = points.length > 1 ? width / (points.length - 1) : 0;

  const coordinates = points.map((point, index) => {
    const x = index * step;
    const y = baseY - (point.net / trendMaxAbs.value) * amplitude;
    return `${x},${y}`;
  });

  return coordinates.join(" ");
});

const trendAreaPath = computed(() => {
  const points = trendPoints.value;
  if (points.length === 0) {
    return "";
  }

  const width = 100;
  const baseY = 50;
  const amplitude = 40;
  const step = points.length > 1 ? width / (points.length - 1) : 0;

  const linePoints = points.map((point, index) => {
    const x = index * step;
    const y = baseY - (point.net / trendMaxAbs.value) * amplitude;
    return `${x},${y}`;
  });

  return `M0,50 L${linePoints.join(" L")} L${width},50 Z`;
});

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const accountTypeLabel: Record<AccountType, string> = {
  checking: "Conta Corrente",
  savings: "Poupanca",
  cash: "Carteira",
  credit: "Cartao",
};

const txTypeLabel: Record<TransactionType, string> = {
  income: "Receita",
  expense: "Despesa",
};

function formatCurrency(value: number): string {
  return currency.format(Number(value || 0));
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${m}/${year.slice(2)}`;
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

function toggleTheme() {
  themeMode.value = themeMode.value === "dark" ? "light" : "dark";
}

function resetTransactionForm() {
  editingTransactionId.value = null;
  txType.value = "expense";
  txCategory.value = EXPENSE_CATEGORIES[0];
  txDescription.value = "";
  txAmount.value = 0;
  txDate.value = new Date().toISOString().slice(0, 10);
}

function buildFilters() {
  const filters: {
    startDate?: string;
    endDate?: string;
    type?: TxFilterType;
    category?: string;
    accountId?: number;
  } = {};

  if (filterStartDate.value) {
    filters.startDate = filterStartDate.value;
  }

  if (filterEndDate.value) {
    filters.endDate = filterEndDate.value;
  }

  if (filterType.value !== "all") {
    filters.type = filterType.value;
  }

  if (filterCategory.value) {
    filters.category = filterCategory.value;
  }

  if (filterAccountId.value) {
    filters.accountId = filterAccountId.value;
  }

  return filters;
}

async function loadTransactions() {
  if (!user.value) {
    return;
  }

  transactions.value = await window.api.listTransactions(user.value.id, buildFilters());
}

async function loadAllTransactions() {
  if (!user.value) {
    return;
  }

  allTransactions.value = await window.api.listTransactions(user.value.id);
}

async function loadBudgets() {
  if (!user.value) {
    return;
  }

  budgets.value = await window.api.listBudgets(user.value.id, budgetMonth.value);
}

async function loadDashboardData() {
  if (!user.value) {
    return;
  }

  const userId = user.value.id;
  const [accountsData, summaryData] = await Promise.all([window.api.listAccounts(userId), window.api.getSummary(userId)]);

  accounts.value = accountsData;
  summary.value = summaryData;

  if (!txAccountId.value && accountsData.length > 0) {
    txAccountId.value = accountsData[0].id;
  }

  if (filterAccountId.value && !accountsData.find((acc) => acc.id === filterAccountId.value)) {
    filterAccountId.value = 0;
  }

  await Promise.all([loadTransactions(), loadAllTransactions(), loadBudgets()]);
}

async function handleRegister() {
  authMessage.value = "";
  authLoading.value = true;

  try {
    const result = await window.api.register({
      name: registerName.value,
      email: registerEmail.value,
      password: registerPassword.value,
    });

    if (!result.ok || !result.user) {
      authMessage.value = result.message ?? "Falha no cadastro.";
      return;
    }

    user.value = result.user;
    registerPassword.value = "";
    dashboardMessage.value = "Cadastro realizado com sucesso.";
    await loadDashboardData();
  } finally {
    authLoading.value = false;
  }
}

async function handleLogin() {
  authMessage.value = "";
  authLoading.value = true;

  try {
    const result = await window.api.login({
      email: loginEmail.value,
      password: loginPassword.value,
    });

    if (!result.ok || !result.user) {
      authMessage.value = result.message ?? "Falha no login.";
      return;
    }

    user.value = result.user;
    loginPassword.value = "";
    dashboardMessage.value = "Login realizado com sucesso.";
    await loadDashboardData();
  } finally {
    authLoading.value = false;
  }
}

async function handleCreateAccount() {
  if (!user.value) {
    return;
  }

  dashboardMessage.value = "";
  const result = await window.api.createAccount(user.value.id, {
    name: accountName.value,
    type: accountType.value,
    initialBalance: Number(accountInitialBalance.value),
  });

  if (!result.ok) {
    dashboardMessage.value = result.message ?? "Nao foi possivel criar a conta.";
    return;
  }

  accountName.value = "";
  accountInitialBalance.value = 0;
  dashboardMessage.value = "Conta criada com sucesso.";
  await loadDashboardData();
}

async function handleSaveTransaction() {
  if (!user.value) {
    return;
  }

  dashboardMessage.value = "";
  const payload = {
    accountId: Number(txAccountId.value),
    type: txType.value,
    category: txCategory.value,
    description: txDescription.value,
    amount: Number(txAmount.value),
    date: txDate.value,
  };

  const result = isEditingTransaction.value
    ? await window.api.updateTransaction(user.value.id, { id: Number(editingTransactionId.value), ...payload })
    : await window.api.createTransaction(user.value.id, payload);

  if (!result.ok) {
    dashboardMessage.value = result.message ?? "Nao foi possivel salvar a transacao.";
    return;
  }

  dashboardMessage.value = isEditingTransaction.value ? "Transacao atualizada." : "Transacao registrada.";
  resetTransactionForm();
  await loadDashboardData();
}

function startEditTransaction(tx: Transaction) {
  editingTransactionId.value = tx.id;
  txAccountId.value = tx.account_id;
  txType.value = tx.type;
  txCategory.value = tx.category;
  txDescription.value = tx.description ?? "";
  txAmount.value = tx.amount;
  txDate.value = tx.tx_date;
}

async function deleteTransaction(tx: Transaction) {
  if (!user.value) {
    return;
  }

  const result = await window.api.deleteTransaction(user.value.id, tx.id);
  if (!result.ok) {
    dashboardMessage.value = result.message ?? "Nao foi possivel excluir a transacao.";
    return;
  }

  if (editingTransactionId.value === tx.id) {
    resetTransactionForm();
  }

  dashboardMessage.value = "Transacao excluida.";
  await loadDashboardData();
}

function clearFilters() {
  filterStartDate.value = firstDayOfMonth;
  filterEndDate.value = today;
  filterType.value = "all";
  filterCategory.value = "";
  filterAccountId.value = 0;
  loadTransactions();
}

async function applyFilters() {
  await loadTransactions();
}

async function saveBudget() {
  if (!user.value) {
    return;
  }

  const result = await window.api.setBudget(user.value.id, {
    month: budgetMonth.value,
    category: budgetCategory.value,
    limitAmount: Number(budgetLimit.value),
  });

  if (!result.ok) {
    dashboardMessage.value = result.message ?? "Nao foi possivel salvar a meta mensal.";
    return;
  }

  budgetLimit.value = 0;
  dashboardMessage.value = "Meta mensal salva.";
  await loadBudgets();
}

function logout() {
  user.value = null;
  accounts.value = [];
  transactions.value = [];
  allTransactions.value = [];
  budgets.value = [];
  summary.value = { income: 0, expense: 0, balance: 0, transactions: 0 };
  dashboardMessage.value = "";
  resetTransactionForm();
}

watch(txType, () => {
  if (!transactionCategories.value.includes(txCategory.value)) {
    txCategory.value = transactionCategories.value[0];
  }
});

watch(filterType, () => {
  if (filterCategory.value && !filterCategoryOptions.value.includes(filterCategory.value)) {
    filterCategory.value = "";
  }
});

watch(budgetMonth, () => {
  if (user.value) {
    loadBudgets();
  }
});

watch(themeMode, (mode) => {
  applyTheme(mode);
  localStorage.setItem("finance-theme", mode);
});

onMounted(() => {
  const storedTheme = localStorage.getItem("finance-theme");
  themeMode.value = storedTheme === "light" ? "light" : "dark";
  applyTheme(themeMode.value);

  window.api.onMainProcessMessage((message) => {
    console.log(message);
  });
});
</script>

<template>
  <main class="app-shell">
    <div class="top-controls">
      <button type="button" class="secondary" @click="toggleTheme">
        {{ themeMode === "dark" ? "Modo claro" : "Modo escuro" }}
      </button>
    </div>

    <section v-if="!isAuthenticated" class="auth-card">
      <h1>Gestao Financeira Local</h1>
      <p>Login, cadastro e dados no banco local SQLite.</p>

      <div class="auth-switch">
        <button :class="{ active: authMode === 'login' }" @click="authMode = 'login'">Login</button>
        <button :class="{ active: authMode === 'register' }" @click="authMode = 'register'">Cadastro</button>
      </div>

      <form v-if="authMode === 'register'" class="form" @submit.prevent="handleRegister">
        <label>
          Nome
          <input v-model="registerName" type="text" required />
        </label>
        <label>
          E-mail
          <input v-model="registerEmail" type="email" required />
        </label>
        <label>
          Senha
          <input v-model="registerPassword" type="password" minlength="6" required />
        </label>
        <button type="submit" :disabled="authLoading">Criar conta</button>
      </form>

      <form v-else class="form" @submit.prevent="handleLogin">
        <label>
          E-mail
          <input v-model="loginEmail" type="email" required />
        </label>
        <label>
          Senha
          <input v-model="loginPassword" type="password" required />
        </label>
        <button type="submit" :disabled="authLoading">Entrar</button>
      </form>

      <p v-if="authMessage" class="message error">{{ authMessage }}</p>
    </section>

    <section v-else class="dashboard">
      <header class="dashboard-header">
        <div>
          <h2>Painel Financeiro</h2>
          <p>{{ user?.name }} ({{ user?.email }})</p>
        </div>
        <button class="logout" @click="logout">Sair</button>
      </header>

      <div v-if="budgetAlerts.length" class="alerts">
        <p v-for="alert in budgetAlerts" :key="alert.category" :class="alert.status">
          {{ alert.status === "exceeded" ? "Orcamento estourado" : "Orcamento proximo do limite" }}:
          {{ alert.category }} ({{ alert.percent.toFixed(1) }}%)
        </p>
      </div>

      <div class="cards">
        <article class="card micro-card">
          <h3>Saldo Total</h3>
          <strong>{{ formatCurrency(summary.balance) }}</strong>
          <div class="card-meter"><span class="meter-balance" :style="{ width: `${balanceStrength}%` }"></span></div>
        </article>
        <article class="card micro-card">
          <h3>Receitas</h3>
          <strong class="income">{{ formatCurrency(summary.income) }}</strong>
          <div class="card-meter"><span class="meter-income" :style="{ width: `${incomeStrength}%` }"></span></div>
        </article>
        <article class="card micro-card">
          <h3>Despesas</h3>
          <strong class="expense">{{ formatCurrency(summary.expense) }}</strong>
          <div class="card-meter"><span class="meter-expense" :style="{ width: `${expenseStrength}%` }"></span></div>
        </article>
        <article class="card micro-card">
          <h3>Transacoes</h3>
          <strong class="count-pop">{{ summary.transactions }}</strong>
          <div class="card-meter"><span class="meter-neutral" :style="{ width: '100%' }"></span></div>
        </article>
      </div>

      <section class="panel trend-panel">
        <div class="trend-head">
          <h3>Tendencia Mensal (Resultado Liquido)</h3>
          <small>Ultimos 6 meses</small>
        </div>

        <svg viewBox="0 0 100 56" preserveAspectRatio="none" class="trend-chart" aria-label="Grafico de tendencia mensal">
          <line x1="0" y1="50" x2="100" y2="50" class="trend-axis" />
          <path :d="trendAreaPath" class="trend-area" />
          <polyline :points="trendPath" class="trend-line" />
        </svg>

        <div class="trend-grid">
          <div v-for="point in trendPoints" :key="point.month" class="trend-col">
            <strong :class="point.net >= 0 ? 'income' : 'expense'">{{ formatCurrency(point.net) }}</strong>
            <span>{{ monthLabel(point.month) }}</span>
          </div>
        </div>
      </section>

      <div class="grid">
        <section class="panel">
          <h3>Nova Conta</h3>
          <form class="form" @submit.prevent="handleCreateAccount">
            <label>
              Nome da conta
              <input v-model="accountName" type="text" required />
            </label>
            <label>
              Tipo
              <select v-model="accountType">
                <option value="checking">Conta Corrente</option>
                <option value="savings">Poupanca</option>
                <option value="cash">Carteira</option>
                <option value="credit">Cartao</option>
              </select>
            </label>
            <label>
              Saldo inicial
              <input v-model.number="accountInitialBalance" type="number" step="0.01" />
            </label>
            <button type="submit">Salvar conta</button>
          </form>
        </section>

        <section class="panel">
          <h3>{{ isEditingTransaction ? "Editar Transacao" : "Nova Transacao" }}</h3>
          <form class="form" @submit.prevent="handleSaveTransaction">
            <label>
              Conta
              <select v-model.number="txAccountId" required>
                <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
              </select>
            </label>
            <label>
              Tipo
              <select v-model="txType">
                <option value="income">Receita</option>
                <option value="expense">Despesa</option>
              </select>
            </label>
            <label>
              Categoria
              <select v-model="txCategory">
                <option v-for="cat in transactionCategories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </label>
            <label>
              Descricao
              <input v-model="txDescription" type="text" />
            </label>
            <label>
              Valor
              <input v-model.number="txAmount" type="number" step="0.01" min="0.01" required />
            </label>
            <label>
              Data
              <input v-model="txDate" type="date" required />
            </label>
            <div class="inline-actions">
              <button type="submit" :disabled="accounts.length === 0">
                {{ isEditingTransaction ? "Atualizar" : "Salvar" }}
              </button>
              <button v-if="isEditingTransaction" type="button" class="secondary" @click="resetTransactionForm">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      </div>

      <section class="panel">
        <h3>Filtros de Transacoes</h3>
        <form class="form form-grid" @submit.prevent="applyFilters">
          <label>
            Data inicial
            <input v-model="filterStartDate" type="date" />
          </label>
          <label>
            Data final
            <input v-model="filterEndDate" type="date" />
          </label>
          <label>
            Tipo
            <select v-model="filterType">
              <option value="all">Todos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </label>
          <label>
            Categoria
            <select v-model="filterCategory">
              <option value="">Todas</option>
              <option v-for="cat in filterCategoryOptions" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </label>
          <label>
            Conta
            <select v-model.number="filterAccountId">
              <option :value="0">Todas</option>
              <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
            </select>
          </label>
          <div class="inline-actions">
            <button type="submit">Aplicar</button>
            <button type="button" class="secondary" @click="clearFilters">Limpar</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <h3>Metas Mensais por Categoria</h3>
        <form class="form form-grid" @submit.prevent="saveBudget">
          <label>
            Mes
            <input v-model="budgetMonth" type="month" required />
          </label>
          <label>
            Categoria
            <select v-model="budgetCategory">
              <option v-for="cat in EXPENSE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </label>
          <label>
            Limite
            <input v-model.number="budgetLimit" type="number" min="0.01" step="0.01" required />
          </label>
          <div class="inline-actions">
            <button type="submit">Salvar meta</button>
          </div>
        </form>

        <ul class="list">
          <li v-for="budget in budgets" :key="budget.category">
            <div>
              <strong>{{ budget.category }}</strong>
              <small>
                Gasto {{ formatCurrency(budget.spent) }} de {{ formatCurrency(budget.limit) }}
                ({{ budget.percent.toFixed(1) }}%)
              </small>
            </div>
            <strong :class="budget.status === 'exceeded' ? 'expense' : budget.status === 'warning' ? 'warn' : 'income'">
              {{ formatCurrency(budget.remaining) }}
            </strong>
          </li>
        </ul>
      </section>

      <section class="panel">
        <h3>Contas</h3>
        <ul class="list">
          <li v-for="acc in accounts" :key="acc.id">
            <span>{{ acc.name }} ({{ accountTypeLabel[acc.type] }})</span>
            <strong>{{ formatCurrency(acc.current_balance) }}</strong>
          </li>
        </ul>
      </section>

      <section class="panel">
        <h3>Historico de Transacoes</h3>
        <ul class="list">
          <li v-for="tx in transactions" :key="tx.id">
            <div>
              <strong>{{ txTypeLabel[tx.type] }}</strong>
              <span>{{ tx.category }} - {{ tx.account_name }}</span>
              <small>{{ tx.tx_date }}{{ tx.description ? ` - ${tx.description}` : "" }}</small>
            </div>
            <div class="tx-actions">
              <strong :class="tx.type === 'income' ? 'income' : 'expense'">
                {{ tx.type === "income" ? "+" : "-" }}{{ formatCurrency(tx.amount) }}
              </strong>
              <div class="inline-actions">
                <button type="button" class="secondary" @click="startEditTransaction(tx)">Editar</button>
                <button type="button" class="danger" @click="deleteTransaction(tx)">Excluir</button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <p v-if="dashboardMessage" class="message">{{ dashboardMessage }}</p>
    </section>
  </main>
</template>