export type RestappModality = 'delivery' | 'pickup' | 'dine_in' | 'scheduled';
export type RestappOrderStatus =
  | 'draft'
  | 'pending_confirmation'
  | 'confirmed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'in_transit'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type RestappTableStatus =
  | 'free'
  | 'reserved'
  | 'occupied'
  | 'cleaning'
  | 'out_of_service';

export type RestappAgentPersona =
  | 'friendly'
  | 'elegant'
  | 'direct'
  | 'youthful'
  | 'family'
  | 'formal'
  | 'dominican_soft';

export type RestappSettings = {
  team_id: number;
  is_active: boolean;
  setup_completed: boolean;
  beta_mode: boolean;
  restaurant_name: string;
  legal_name: string | null;
  tagline: string | null;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  country: string;
  currency: string;
  language: string;
  timezone: string;
  tax_rate: number;
  service_fee: number;
  tip_enabled: boolean;
  address: string | null;
  lat: number | null;
  lng: number | null;
  modes: RestappModality[];
  payment_methods: string[];
  min_order_amount: number;
  require_order_confirmation: boolean;
  auto_accept_orders: boolean;
  reservations_enabled: boolean;
  reservation_duration_min: number;
  reservation_tolerance_min: number;
  max_party_size: number;
  waitlist_enabled: boolean;
  agent_enabled: boolean;
  agent_provider: 'openai' | 'gemini' | 'inherit';
  agent_model: string | null;
  agent_persona: RestappAgentPersona;
  agent_tone: string | null;
  agent_formal: boolean;
  agent_instructions: string | null;
  agent_max_options: number;
  handoff_enabled: boolean;
  handoff_hours: string | null;
  zernio_account_id: string | null;
  zernio_phone: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RestappAgentParams = {
  recommend_bestsellers: boolean;
  prioritize_promos: boolean;
  promote_combos: boolean;
  offer_drinks: boolean;
  offer_sides: boolean;
  cross_sell: boolean;
  upsell: boolean;
  no_out_of_stock: boolean;
  no_invent_discounts: boolean;
  no_pushy: boolean;
  no_repeat_questions: boolean;
  no_reset_conversation: boolean;
  confirm_before_order: boolean;
  confirm_before_reservation: boolean;
  max_recommendations: number;
  budget_min: number | null;
  budget_max: number | null;
  priority_product_ids: number[];
  excluded_categories: string[];
  handle_allergens: boolean;
  handle_vegetarian: boolean;
  handle_spicy: boolean;
};
