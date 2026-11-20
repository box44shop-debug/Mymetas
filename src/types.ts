export type GoalCategory =
  | 'casa'
  | 'veiculo'
  | 'viagem'
  | 'familia'
  | 'estudos'
  | 'negocio'
  | 'emergencia'
  | 'outros';

export type Goal = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  category: GoalCategory;
  target_cents: number;
  target_date: string | null;
  status: 'active' | 'completed' | 'archived' | 'paused';
  created_at: string;
  saved_cents: number;
  is_shared: boolean;
};

export type Contribution = {
  id: string;
  goal_id: string;
  user_id: string;
  amount_cents: number;
  contribution_date: string;
  note: string | null;
  created_at: string;
};
