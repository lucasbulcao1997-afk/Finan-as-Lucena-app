export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id?: string;
  amount: number;
  category: string;
  date: string; // ISO 8601
  description?: string;
  type: TransactionType;
  uid: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
}
