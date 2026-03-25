import { useState, useEffect, useMemo, FormEvent } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  deleteDoc, 
  doc,
  getDocFromServer,
  updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { format, startOfMonth, endOfMonth, parseISO, isSameMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  PlusCircle, 
  MinusCircle, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Trash2, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  Share2,
  LogOut,
  Plus,
  X,
  Edit2,
  Download,
  PieChart as PieChartIcon,
  BarChart3,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend
} from 'recharts';
import { db, auth, signInWithGoogle, logout } from './firebase';
import { Transaction, TransactionType } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CATEGORIES = [
  'Alimentação',
  'Água',
  'Barbeiro - Lucas',
  'Cartão de crédito - Adriely',
  'Cartão de crédito - BB',
  'Cartão de crédito - Lucas',
  'Cartão de crédito - Sicoob',
  'Dízimo - Adriely',
  'Dízimo - Lucas',
  'Educação',
  'Energia',
  'Extra - Hamburgueria',
  'Extra - Motoboy',
  'Fatura claro/Tv assinatura',
  'Financiamento - Casa',
  'Internet',
  'Investimentos',
  'Ipva - carro',
  'Lazer',
  'Moradia',
  'Outros',
  'Plano odontológico',
  'Salário',
  'Saúde',
  'Seguro de Vida - Adriely',
  'Seguro de Vida - Lucas',
  'Transporte',
  'Vale refeição - Adriely'
];

const CATEGORY_COLORS: Record<string, string> = {
  'Alimentação': '#F87171',
  'Água': '#60A5FA',
  'Barbeiro - Lucas': '#FBBF24',
  'Cartão de crédito - Adriely': '#A78BFA',
  'Cartão de crédito - BB': '#34D399',
  'Cartão de crédito - Lucas': '#F472B6',
  'Cartão de crédito - Sicoob': '#10B981',
  'Dízimo - Adriely': '#3B82F6',
  'Dízimo - Lucas': '#94A3B8',
  'Educação': '#F472B6',
  'Energia': '#FBBF24',
  'Extra - Hamburgueria': '#F87171',
  'Extra - Motoboy': '#F87171',
  'Fatura claro/Tv assinatura': '#60A5FA',
  'Financiamento - Casa': '#60A5FA',
  'Internet': '#A78BFA',
  'Investimentos': '#3B82F6',
  'Ipva - carro': '#FBBF24',
  'Lazer': '#A78BFA',
  'Moradia': '#60A5FA',
  'Outros': '#94A3B8',
  'Plano odontológico': '#34D399',
  'Salário': '#10B981',
  'Saúde': '#34D399',
  'Seguro de Vida - Adriely': '#F472B6',
  'Seguro de Vida - Lucas': '#F472B6',
  'Transporte': '#FBBF24',
  'Vale refeição - Adriely': '#F87171'
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  
  // Form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TransactionType>('expense');

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Connection test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Transactions listener
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const q = query(
      collection(db, 'transactions'),
      where('uid', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      
      setTransactions(data.filter(t => {
        const tDate = parseISO(t.date);
        return isSameMonth(tDate, currentMonth);
      }));
    }, (error) => {
      console.error('Firestore Error:', error);
    });

    return () => unsubscribe();
  }, [user, currentMonth]);

  const totals = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.type === 'income') {
        acc.income += t.amount;
        acc.balance += t.amount;
      } else {
        acc.expense += t.amount;
        acc.balance -= t.amount;
      }
      return acc;
    }, { income: 0, expense: 0, balance: 0 });
  }, [transactions]);

  const chartData = useMemo(() => {
    const expensesByCategory = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    const pieData = Object.entries(expensesByCategory).map(([name, value]) => ({
      name,
      value: Number(value)
    })).sort((a, b) => b.value - a.value);

    const barData = [
      { name: 'Entradas', valor: totals.income, fill: '#10B981' },
      { name: 'Saídas', valor: totals.expense, fill: '#EF4444' }
    ];

    return { pieData, barData };
  }, [transactions, totals]);

  const resetForm = () => {
    setAmount('');
    setCategory(CATEGORIES[0]);
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setDescription('');
    setType('expense');
    setEditingTransaction(null);
  };

  const handleAddTransaction = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !amount) return;

    const transactionData = {
      amount: parseFloat(amount),
      category,
      date: new Date(date + 'T12:00:00Z').toISOString(),
      description,
      type,
      uid: user.uid
    };

    try {
      if (editingTransaction?.id) {
        await updateDoc(doc(db, 'transactions', editingTransaction.id), transactionData);
      } else {
        await addDoc(collection(db, 'transactions'), transactionData);
      }
      
      resetForm();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving transaction:', error);
    }
  };

  const handleEditClick = (t: Transaction) => {
    setEditingTransaction(t);
    setAmount(t.amount.toString());
    setCategory(t.category);
    setDate(format(parseISO(t.date), 'yyyy-MM-dd'));
    setDescription(t.description || '');
    setType(t.type);
    setIsModalOpen(true);
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const handleShare = () => {
    const text = `Meu saldo em ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })}: R$ ${totals.balance.toFixed(2)}`;
    if (navigator.share) {
      navigator.share({
        title: 'Controle Financeiro',
        text: text,
        url: window.location.href
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      alert('Link e resumo copiados para a área de transferência!');
    }
  };

  const handleExportExcel = () => {
    if (transactions.length === 0) {
      alert('Não há lançamentos para exportar neste mês.');
      return;
    }

    const dataToExport = transactions.map(t => ({
      Data: format(parseISO(t.date), 'dd/MM/yyyy'),
      Tipo: t.type === 'income' ? 'Entrada' : 'Saída',
      Categoria: t.category,
      Observação: t.description || '-',
      Valor: t.amount
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Apply currency format to the 'Valor' column (Column E, index 4)
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: 4 }); // Column E is index 4
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].z = '"R$ " #,##0.00';
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lançamentos");

    // Generate filename
    const fileName = `Financas_Lucena_${format(currentMonth, 'MMMM_yyyy', { locale: ptBR })}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
  };

  const handleFinalize = () => {
    if (transactions.length === 0) {
      alert('Adicione pelo menos um lançamento antes de finalizar.');
      return;
    }
    setIsFinalizeModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zinc-900"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl shadow-zinc-200/50 text-center"
        >
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Wallet className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 mb-2">Finanças Lucena</h1>
          <p className="text-zinc-500 mb-8">Controle seus gastos de forma simples e elegante.</p>
          <button
            onClick={signInWithGoogle}
            className="w-full py-4 px-6 bg-zinc-900 text-white rounded-2xl font-semibold hover:bg-zinc-800 transition-all flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Entrar com Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans pb-24">
      {/* Header */}
      <header className="bg-white border-b border-zinc-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
              <Wallet className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">Finanças Lucena</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowCharts(!showCharts)}
              className={cn(
                "p-2 rounded-full transition-colors",
                showCharts ? "bg-zinc-900 text-white" : "hover:bg-zinc-100 text-zinc-500"
              )}
              title={showCharts ? "Ver Lista" : "Ver Gráficos"}
            >
              {showCharts ? <BarChart3 className="w-5 h-5" /> : <PieChartIcon className="w-5 h-5" />}
            </button>
            <button 
              onClick={handleExportExcel}
              className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
              title="Exportar para Excel"
            >
              <Download className="w-5 h-5 text-zinc-500" />
            </button>
            <button 
              onClick={handleShare}
              className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
              title="Compartilhar"
            >
              <Share2 className="w-5 h-5 text-zinc-500" />
            </button>
            <button 
              onClick={logout}
              className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
              title="Sair"
            >
              <LogOut className="w-5 h-5 text-zinc-500" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-8">
        {/* Month Selector */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all border border-transparent hover:border-zinc-200"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 font-semibold text-lg capitalize">
            <Calendar className="w-5 h-5 text-zinc-400" />
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </div>
          <button 
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all border border-transparent hover:border-zinc-200"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Card */}
        <motion.div 
          layout
          className="bg-zinc-900 text-white p-8 rounded-[2rem] shadow-2xl shadow-zinc-900/20 mb-8 relative overflow-hidden"
        >
          <div className="relative z-10">
            <p className="text-zinc-400 text-sm font-medium mb-1">Saldo Total</p>
            <h2 className="text-4xl font-bold tracking-tight mb-8">
              R$ {totals.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl">
                <div className="flex items-center gap-2 text-emerald-400 mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Entradas</span>
                </div>
                <p className="text-lg font-semibold">
                  R$ {totals.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl">
                <div className="flex items-center gap-2 text-rose-400 mb-1">
                  <TrendingDown className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Saídas</span>
                </div>
                <p className="text-lg font-semibold">
                  R$ {totals.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
          {/* Decorative circles */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-zinc-800/50 rounded-full blur-3xl" />
        </motion.div>

        {/* Finalize Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleFinalize}
          className="w-full py-5 bg-emerald-500 text-white rounded-[1.5rem] font-bold text-lg hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 mb-8 flex items-center justify-center gap-3"
        >
          <CheckCircle2 className="w-6 h-6" />
          Finalizar Lançamentos
        </motion.button>

        {showCharts ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            {/* Pie Chart: Expenses by Category */}
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
              <h3 className="font-bold text-xl mb-6">Gastos por Categoria</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || '#94A3B8'} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bar Chart: Income vs Expense */}
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
              <h3 className="font-bold text-xl mb-6">Entradas vs Saídas</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.barData}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="valor" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Transactions List */
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-xl">Lançamentos</h3>
              <span className="text-sm text-zinc-500 font-medium">{transactions.length} itens</span>
            </div>

            <AnimatePresence mode="popLayout">
              {transactions.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12 bg-white rounded-3xl border border-dashed border-zinc-200"
                >
                  <p className="text-zinc-400">Nenhum lançamento este mês.</p>
                </motion.div>
              ) : (
                transactions.map((t) => (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex items-center justify-between group cursor-pointer hover:border-zinc-300 transition-colors"
                    onClick={() => handleEditClick(t)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        t.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {t.type === 'income' ? <PlusCircle className="w-6 h-6" /> : <MinusCircle className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="font-bold text-zinc-900">{t.category}</p>
                        <p className="text-xs text-zinc-400 font-medium">
                          {format(parseISO(t.date), "dd 'de' MMMM", { locale: ptBR })}
                          {t.description && ` • ${t.description}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className={cn(
                        "font-bold text-lg",
                        t.type === 'income' ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {t.type === 'income' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                      </p>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(t);
                          }}
                          className="p-2 text-zinc-300 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            t.id && handleDeleteTransaction(t.id);
                          }}
                          className="p-2 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <button
        onClick={() => {
          resetForm();
          setIsModalOpen(true);
        }}
        className="fixed bottom-8 right-8 w-16 h-16 bg-zinc-900 text-white rounded-2xl shadow-2xl shadow-zinc-900/40 flex items-center justify-center hover:scale-110 transition-transform active:scale-95 z-20"
      >
        <Plus className="w-8 h-8" />
      </button>

      {/* Finalize Success Modal */}
      <AnimatePresence>
        {isFinalizeModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFinalizeModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              
              <h2 className="text-2xl font-bold mb-2">Mês Finalizado!</h2>
              <p className="text-zinc-500 mb-8">
                Todos os lançamentos de <strong>{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</strong> foram salvos e conferidos com sucesso.
              </p>

              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center py-2 border-b border-zinc-100">
                  <span className="text-zinc-500">Total Entradas</span>
                  <span className="font-bold text-emerald-600">R$ {totals.income.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-100">
                  <span className="text-zinc-500">Total Saídas</span>
                  <span className="font-bold text-rose-600">R$ {totals.expense.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-zinc-900 font-bold">Saldo Final</span>
                  <span className="font-bold text-zinc-900">R$ {totals.balance.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => {
                    handleExportExcel();
                    setIsFinalizeModalOpen(false);
                  }}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Exportar Relatório
                </button>
                <button
                  onClick={() => setIsFinalizeModalOpen(false)}
                  className="w-full py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold">
                  {editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento'}
                </h2>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddTransaction} className="space-y-6">
                {/* Type Toggle */}
                <div className="flex p-1 bg-zinc-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setType('expense')}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-bold text-sm transition-all",
                      type === 'expense' ? "bg-white shadow-sm text-rose-600" : "text-zinc-500"
                    )}
                  >
                    Saída
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('income')}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-bold text-sm transition-all",
                      type === 'income' ? "bg-white shadow-sm text-emerald-600" : "text-zinc-500"
                    )}
                  >
                    Entrada
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Valor</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-zinc-400">R$</span>
                      <input
                        autoFocus
                        type="number"
                        step="0.01"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0,00"
                        className="w-full pl-12 pr-4 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 rounded-2xl outline-none font-bold text-xl transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Categoria</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-4 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 rounded-2xl outline-none font-medium transition-all appearance-none"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Data</label>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-4 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 rounded-2xl outline-none font-medium transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Observação (Opcional)</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ex: Aluguel do mês"
                      className="w-full px-4 py-4 bg-zinc-50 border-2 border-transparent focus:border-zinc-900 rounded-2xl outline-none font-medium transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-5 bg-zinc-900 text-white rounded-2xl font-bold text-lg hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/20"
                >
                  {editingTransaction ? 'Salvar Alterações' : 'Adicionar Lançamento'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
